// THE HALLUCINATION FIREWALL, in code.
//
// `lessons.provenance_quote` is NOT NULL in migration 54 so that no write path can store
// a lesson with no grounding passage. That constraint stops a NULL. It cannot stop a
// model from emitting a fluent, plausible, completely invented sentence and calling it a
// quote — and a fabricated quote passes a NOT NULL check exactly as well as a real one.
// This module is what makes the gate real: the quote must be FOUND IN THE CHUNK, by us,
// before the lesson is written.
//
// Two properties make it worth more than a naive `chunkText.includes(quote)`:
//
//   1. It normalises the two texts the same way before comparing. PDF text layers emit
//      curly quotes, en-dashes, ligatures, non-breaking spaces and line-broken words;
//      a model re-types the passage cleanly. A literal `includes` would reject genuine
//      quotes constantly, and a gate that fires on honest work gets weakened by whoever
//      maintains it next — which is how firewalls die.
//   2. On a match it returns THE CHUNK'S OWN SUBSTRING, not the model's rendition. What
//      gets stored is therefore text that provably came out of the source file. The
//      model chooses WHERE to point; it never authors what the citation says.
//
// Nothing here trusts the model's claim about anything, including the page number: the
// caller derives `page_ref` from the chunk's own page span.

export type QuoteRejection =
  | "empty"
  | "too_short"
  | "too_long"
  | "not_found";

export type QuoteVerification =
  | {
    ok: true;
    /** The verbatim substring OF THE CHUNK. This, never the model's text, is what is
     *  stored in `lessons.provenance_quote`. */
    quote: string;
  }
  | { ok: false; reason: QuoteRejection };

/**
 * 40 characters. A gate that accepts "he argues that" is not a gate — short fragments
 * appear in almost any prose, so a model that invented a lesson could still find SOME
 * three-word string in the chunk and clear the check. 40 characters is roughly a clause
 * with content in it: long enough that finding one by accident means the lesson really
 * is about that passage.
 */
const MIN_QUOTE_CHARS = 40;

/**
 * 1,200 characters. The opposite abuse: pasting the whole chunk as the "quote" clears
 * any containment check trivially and grounds nothing — the citation must point at a
 * passage, not at the chunk. Also keeps the UI's "here is where this came from" readable.
 */
const MAX_QUOTE_CHARS = 1_200;

/** Characters a PDF text layer and a model spell differently for the same glyph. */
const CHARACTER_FOLDS: Array<[RegExp, string]> = [
  [/[‘’‚‛′]/g, "'"],
  [/[“”„‟″]/g, '"'],
  [/[‐‑‒–—―−]/g, "-"],
  [/[…]/g, "..."],
  [/[   ]/g, " "],
];

/**
 * Build the comparison form of a string AND the map back to original offsets.
 *
 * The map is the reason this is not two lines: to return the chunk's own substring we
 * have to know which ORIGINAL character each normalised character came from. Without it
 * we could only report "yes, it's in there" and would then store the model's text —
 * which is the thing this module exists to avoid storing.
 */
function normalizeWithOffsets(text: string): { normalized: string; offsets: number[] } {
  // NFKC first: it folds ligatures (ﬁ -> fi) and compatibility forms that a text layer
  // emits and a model does not. Done per-character so offsets stay meaningful.
  let normalized = "";
  const offsets: number[] = [];
  let lastWasSpace = true; // leading whitespace is dropped, so start as if we just saw one

  for (let i = 0; i < text.length; i++) {
    let char = text[i]!;

    for (const [pattern, replacement] of CHARACTER_FOLDS) {
      pattern.lastIndex = 0;
      if (pattern.test(char)) {
        char = replacement;
        break;
      }
    }

    if (/\s/.test(char)) {
      if (lastWasSpace) continue;
      // Spacing AROUND A DASH is typographic, not semantic: the text layer emits
      // "goals—you" and a model retypes it "goals - you" (or the reverse). Treating
      // those as different texts would reject honest quotes on a rule about kerning.
      if (normalized.endsWith("-")) continue;
      normalized += " ";
      offsets.push(i);
      lastWasSpace = true;
      continue;
    }

    const folded = char.normalize("NFKC").toLowerCase();
    for (const piece of folded) {
      // Same rule from the other side: drop a space we already emitted when a dash
      // turns out to follow it.
      if (piece === "-" && normalized.endsWith(" ")) {
        normalized = normalized.slice(0, -1);
        offsets.pop();
      }
      normalized += piece;
      offsets.push(i);
    }
    lastWasSpace = false;
  }

  // Trailing space, if any.
  if (normalized.endsWith(" ")) {
    normalized = normalized.slice(0, -1);
    offsets.pop();
  }

  return { normalized, offsets };
}

/** Public, for tests and for anyone reasoning about why a quote matched. */
export function normalizeForQuoteMatch(text: string): string {
  return normalizeWithOffsets(text).normalized;
}

/**
 * Strip what a model wraps around a citation without changing what it cites: surrounding
 * quotation marks, a leading/trailing ellipsis, and stray whitespace. Anything beyond
 * that is left alone — trimming aggressively would start MAKING quotes match, which is
 * the wrong direction for a gate.
 */
function stripCitationDecoration(quote: string): string {
  let result = quote.trim();
  result = result.replace(/^["'“”‘’]+/, "").replace(/["'“”‘’]+$/, "");
  result = result.replace(/^(\.\.\.|…)\s*/, "").replace(/\s*(\.\.\.|…)$/, "");
  return result.trim();
}

/**
 * The gate. Returns the chunk's own verbatim substring, or a named reason to drop the
 * candidate lesson entirely.
 *
 * "Case-insensitive" is deliberate and is not a loophole: a model routinely re-capitalises
 * the first letter of a fragment lifted from mid-sentence. What "verbatim" is protecting
 * is the WORDS — that this claim came from that passage — and the returned substring is
 * the chunk's own casing regardless, so nothing about the stored citation is softened.
 */
export function verifyQuoteInChunk(quote: string, chunkText: string): QuoteVerification {
  const candidate = stripCitationDecoration(quote ?? "");
  if (candidate.length === 0) return { ok: false, reason: "empty" };
  if (candidate.length > MAX_QUOTE_CHARS) return { ok: false, reason: "too_long" };

  const needle = normalizeForQuoteMatch(candidate);
  if (needle.length < MIN_QUOTE_CHARS) return { ok: false, reason: "too_short" };

  const haystack = normalizeWithOffsets(chunkText);
  const index = haystack.normalized.indexOf(needle);
  if (index < 0) return { ok: false, reason: "not_found" };

  const startOffset = haystack.offsets[index]!;
  const endOffset = haystack.offsets[index + needle.length - 1]!;
  return { ok: true, quote: chunkText.slice(startOffset, endOffset + 1).trim() };
}

export const QUOTE_LIMITS = { MIN_QUOTE_CHARS, MAX_QUOTE_CHARS } as const;
