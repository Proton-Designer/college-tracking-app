// Page text -> retrieval chunks. Pure, deterministic, no I/O — every decision about
// what a chunk IS lives here and is unit-testable without a database or a model.
//
// D9 applies directly: chunk boundaries are a calculation, so deterministic code makes
// them. Asking a model where to cut a book would be both expensive and unreproducible,
// and would make the provenance gate downstream meaningless (a quote must be verifiable
// against a chunk whose contents were decided by code, not by the same class of system
// that produced the quote).

export interface PageText {
  page: number;
  text: string;
}

export interface Chunk {
  text: string;
  pageStart: number;
  pageEnd: number;
  sortOrder: number;
}

export interface ChunkOptions {
  /** ~3,500 characters ≈ 875 tokens by the repo's `len/4` convention. Chosen against the
   *  two consumers, not as a round number: it is large enough that a chunk contains a
   *  complete argument (claim, mechanism, and the example that grounds it — a lesson
   *  split across a boundary is a lesson that fails the provenance gate through no fault
   *  of the model), and small enough that the mid-tier extraction call stays cheap
   *  enough to run over an entire book. */
  targetChars?: number;
  /** Below this, a trailing fragment is folded back into the previous chunk instead of
   *  becoming a chunk of its own. A 90-character "chunk" costs a whole model call to
   *  produce nothing. */
  minChars?: number;
  /** Sentences re-shown at the head of the next chunk. Without overlap, an argument that
   *  straddles a boundary is invisible to BOTH calls. ~300 chars is one or two sentences
   *  of context — the cost is that overlap text can ground a lesson in either chunk,
   *  which is harmless (the merge pass dedupes) where losing the argument is not. */
  overlapChars?: number;
  /** Where `sortOrder` starts. The state machine chunks one page-window per invocation
   *  and carries the next value in its cursor, so ordering stays globally monotonic
   *  across invocations. */
  startSortOrder?: number;
}

const DEFAULTS = {
  targetChars: 3_500,
  minChars: 400,
  overlapChars: 300,
  startSortOrder: 0,
} as const;

interface Unit {
  text: string;
  page: number;
}

/** Collapse every run of whitespace (including the page-layout newlines pdfPages
 *  preserves for heading detection) into single spaces. A chunk is prose for a model,
 *  not a layout. */
function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Split into sentence-ish units, keeping the terminator. Deliberately simple: this is a
 * chunk boundary heuristic, not a linguistics problem, and the failure mode of an
 * over-eager split ("Dr. Smith") is a slightly-early chunk boundary, which costs
 * nothing that the overlap does not already cover.
 */
function splitSentences(text: string): string[] {
  const parts = text.split(/(?<=[.!?])\s+(?=[^a-z])/u);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** A single sentence longer than a whole chunk (a table flattened into one line, a
 *  citation block) is hard-split on a word boundary. Without this the greedy loop below
 *  would emit one oversized chunk and blow the extraction call's input estimate. */
function hardSplit(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf(" ", maxChars);
    if (cut <= 0) cut = maxChars;
    pieces.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) pieces.push(rest);
  return pieces;
}

/**
 * Greedy fill to `targetChars` on sentence boundaries, with a sentence-aligned overlap
 * carried into the next chunk. Page span is derived from the units a chunk actually
 * contains — including its overlap units, which is why a chunk's `pageStart` can be the
 * previous chunk's last page. That is correct: the text really is on both pages.
 *
 * Pages are expected in ascending order; blank pages contribute nothing and are simply
 * absent from the span.
 */
export function chunkPages(pages: PageText[], options: ChunkOptions = {}): Chunk[] {
  const targetChars = options.targetChars ?? DEFAULTS.targetChars;
  const minChars = options.minChars ?? DEFAULTS.minChars;
  const overlapChars = options.overlapChars ?? DEFAULTS.overlapChars;
  const startSortOrder = options.startSortOrder ?? DEFAULTS.startSortOrder;

  const units: Unit[] = [];
  for (const page of pages) {
    const normalized = normalizeWhitespace(page.text);
    if (normalized.length === 0) continue;
    for (const sentence of splitSentences(normalized)) {
      for (const piece of hardSplit(sentence, targetChars)) {
        units.push({ text: piece, page: page.page });
      }
    }
  }

  if (units.length === 0) return [];

  const chunks: Chunk[] = [];
  let current: Unit[] = [];
  let currentLength = 0;

  const flush = (): void => {
    if (current.length === 0) return;
    const text = current.map((u) => u.text).join(" ");
    const chunkPagesSpan = current.map((u) => u.page);
    chunks.push({
      text,
      pageStart: Math.min(...chunkPagesSpan),
      pageEnd: Math.max(...chunkPagesSpan),
      sortOrder: startSortOrder + chunks.length,
    });
  };

  /** The tail units of the just-flushed chunk that fit inside `overlapChars`. */
  const overlapUnits = (): Unit[] => {
    if (overlapChars <= 0) return [];
    const tail: Unit[] = [];
    let length = 0;
    for (let i = current.length - 1; i >= 0; i--) {
      const unit = current[i]!;
      if (length + unit.text.length > overlapChars) break;
      tail.unshift(unit);
      length += unit.text.length + 1;
    }
    // Never carry the ENTIRE chunk forward — that would make no progress and, with a
    // small book, loop.
    return tail.length >= current.length ? tail.slice(1) : tail;
  };

  for (const unit of units) {
    const projected = currentLength === 0 ? unit.text.length : currentLength + 1 + unit.text.length;
    if (projected > targetChars && currentLength >= minChars) {
      flush();
      const carried = overlapUnits();
      current = [...carried];
      currentLength = carried.reduce((sum, u) => sum + u.text.length + 1, 0);
    }
    current.push(unit);
    currentLength = currentLength === 0 ? unit.text.length : currentLength + 1 + unit.text.length;
  }

  // The final partial chunk. If it is only overlap plus a scrap, fold it back rather
  // than paying a model call for a fragment the previous chunk already contains.
  if (currentLength >= minChars || chunks.length === 0) {
    flush();
  } else if (current.length > 0) {
    const previous = chunks[chunks.length - 1];
    if (previous) {
      const carriedText = current.map((u) => u.text).join(" ");
      if (!previous.text.endsWith(carriedText)) {
        const newUnits = current.filter((u) => !previous.text.includes(u.text));
        if (newUnits.length > 0) {
          previous.text = `${previous.text} ${newUnits.map((u) => u.text).join(" ")}`;
          previous.pageEnd = Math.max(previous.pageEnd, ...newUnits.map((u) => u.page));
        }
      }
    }
  }

  return chunks;
}
