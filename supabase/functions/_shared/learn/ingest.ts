// The `ingest_jobs` state machine — migration 54, section 5, implemented.
//
// THE ONE RULE: one invocation advances ONE step, checkpoints its cursor, and returns.
// Never a loop that keeps going "while there is time left". Steps that are inherently
// long (text extraction over 300 pages, extraction over 200 chunks) advance a SLICE and
// leave the step where it is, so the next invocation resumes from the cursor rather than
// from the beginning. Nothing here runs for minutes, and nothing here is lost if the
// runtime kills the invocation mid-flight — the worst case is that one slice is redone.
//
// WHERE THE INTERMEDIATE TEXT LIVES, and why. Between `extracting_text` and `chunking`
// the pipeline is holding a book's worth of raw page text across invocations. It cannot
// live in `ingest_jobs.cursor` (megabytes of jsonb rewritten on every checkpoint) and
// there is no page table in migration 54. So it lives in `source_chunks` in a STAGING
// FORM: one row per page, `page_start = page_end = <page>`, and **`sort_order = -page`**.
// The negative sort_order is the discriminator and is load-bearing — real chunks always
// have `sort_order >= 0`, so "page rows" and "chunks" are distinguishable by a plain
// `lt`/`gte` predicate with no extra column and no ambiguity. `chunking` reads a window
// of page rows, writes the real chunks, and deletes the page rows it consumed, so the
// staging form exists only inside a source whose status is still 'processing' and which
// no reader is looking at.
//
// WHERE CANDIDATE LESSONS LIVE, and why. `extracting_lessons` writes candidates straight
// into `lessons` with `status = 'provisional'`; `merging` promotes the survivors to
// 'active' and ARCHIVES the rest. That puts every candidate under the NOT NULL
// `provenance_quote` constraint at the moment it is written — the schema-level firewall
// applies to candidates too, not only to the final set — which a separate jsonb staging
// blob would have bypassed entirely.
//
// This used to be `active = false`, and the boolean was carrying two incompatible
// meanings: "candidate, not yet judged" and "judged and rejected". The only way to keep
// them apart was to DELETE the losers, which is exactly the thing ULM's ADR-010 says must
// never happen — a review of a card whose lesson later loses a dedup contest has to stay
// referentially intact. Migration 54's `lesson_status` enum separates the two, so nothing
// here deletes any more.
//
// WHERE CARDS ARE WRITTEN, and why last. `generating_cards` runs AFTER `merging`, over the
// lessons the merge pass promoted to 'active'. Carding candidates first would pay a model to
// write cards for lessons a dedup contest is about to archive — cards migration 60's trigger
// suspends the instant they are inserted. It is a step of its own rather than the tail of
// `merging` because it is one model call PER LESSON, tens of them for a book, and the one rule
// below forbids a single invocation from running that long. See cardGeneration.ts for the D45
// split that governs what a model writes and what a rule writes.
//
// PROGRESSIVE AVAILABILITY (ULM ADR-010, addendum §1.1). Provisional lessons are readable
// the moment their chunk clears the provenance gate, and the source flips to 'partial' as
// soon as `computePartialThreshold` of its lessons have servable cards — usable before
// ingestion finishes, rather than all-or-nothing at the end. Every step also writes
// `progress_current`/`progress_total` scoped to its own unit of work, because a stage
// label alone cannot tell a long step from a hung one.
//
// D9 throughout: the model triages, extracts and ranks. Deterministic code decides page
// ranges, chunk boundaries, section structure, similarity clusters, the lesson count, the
// dedupe guarantee, and — the one that matters most — whether a citation is real.

import { embedTexts } from "../embeddings/embed.ts";
import type { EmbeddingsProvider } from "../embeddings/types.ts";
import { computeEmbeddingsCostUsd } from "../embeddings/costs.ts";
import type { GatewayDeps } from "../llm/gateway.ts";
import type { UsageLogEntry } from "../llm/types.ts";
import { generateCardsForLesson } from "./cardGeneration.ts";
import { chunkPages } from "./chunking.ts";
import { newInvariantCounters, type InvariantCounters } from "./invariants.ts";
import { extractLessonsFromChunk, triageChunks, type ChunkForModel } from "./lessonExtraction.ts";
import { buildClusterPlan, mergeAndRank, type MergeCandidate } from "./merge.ts";
import { extractPdfPageRange } from "./pdfPages.ts";
import type { IngestJobRow, IngestRepo, IngestStep, NewCandidateLesson, NewChunk } from "./repo.ts";
import { detectSections, sectionForPage, type DetectedSection } from "./structure.ts";
import {
  CARD_LESSONS_PER_INVOCATION,
  CHUNK_WINDOW_PAGES,
  EMBED_BATCH_SIZE,
  EXTRACT_CHUNKS_PER_INVOCATION,
  MAX_CANDIDATES,
  MAX_STEP_ATTEMPTS,
  TEXT_SLICE_PAGES,
  TRIAGE_BATCH_SIZE,
  computePartialThreshold,
  targetLessonCount,
} from "./types.ts";

export interface IngestDeps {
  repo: IngestRepo;
  /** Null when no ANTHROPIC_API_KEY is configured. The model steps then BLOCK (they do
   *  not fail and do not burn attempts) — a missing key is a server configuration state
   *  the operator fixes, not a job defect, and the job resumes the moment it is fixed. */
  gateway: GatewayDeps | null;
  /** Null when no VOYAGE_API_KEY is configured — D41's expected state today. */
  embeddings: EmbeddingsProvider | null;
  /** Injected so the driver's tests never open a PDF. */
  extractPages: typeof extractPdfPageRange;
  /** Voyage spend into the same ledger the budget gate sums (migration 55). */
  logUsage: (entry: UsageLogEntry) => Promise<void>;
  now: () => Date;
}

export type AdvanceOutcome =
  /** A step advanced (or a slice of one did). `moreWork` says whether another invocation
   *  has something to do right now. */
  | { kind: "advanced"; step: IngestStep; moreWork: boolean; note: string | null }
  /** Waiting on a credential or a decision outside this job. NOT an attempt, NOT a
   *  failure: the cron keeps re-driving and the job proceeds when the block clears. */
  | { kind: "blocked"; step: IngestStep; reason: string }
  | { kind: "retry"; step: IngestStep; attempts: number; reason: string }
  | { kind: "failed"; reason: string }
  | { kind: "done" }
  | { kind: "notFound" };

// ============================================================================
// Cursor readers — tolerant of a cursor written by an older shape, never crashing
// ============================================================================

function num(cursor: Record<string, unknown>, key: string, fallback: number): number {
  const value = cursor[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bool(cursor: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = cursor[key];
  return typeof value === "boolean" ? value : fallback;
}

/**
 * The invariant counters, carried across invocations in the cursor.
 *
 * Read field-by-field off a fresh zeroed object rather than cast: a job checkpointed before a
 * counter existed must resume with that counter at 0, not `undefined`, or the first `++` produces
 * NaN and the whole record silently stops meaning anything.
 */
function readCounters(cursor: Record<string, unknown>): InvariantCounters {
  const stored = cursor.invariants;
  const counters = newInvariantCounters();
  if (stored == null || typeof stored !== "object") return counters;
  const source = stored as Record<string, unknown>;
  for (const key of Object.keys(counters) as Array<keyof InvariantCounters>) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) counters[key] = value;
  }
  return counters;
}

// ============================================================================
// Entry points
// ============================================================================

export async function advanceIngestJob(deps: IngestDeps, jobId: number): Promise<AdvanceOutcome> {
  const job = await deps.repo.loadJob(jobId);
  if (!job) return { kind: "notFound" };
  if (job.step === "done") return { kind: "done" };
  if (job.step === "failed") return { kind: "failed", reason: "Job already failed." };

  try {
    return await runStep(deps, job);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return await recordFailure(deps, job, reason);
  }
}

/**
 * Cron re-drive: every non-terminal job whose heartbeat is older than `staleBefore` gets
 * ONE step advanced. Deliberately one step each rather than draining a job to completion:
 * a single stalled job must not be able to consume the whole cron invocation, and the
 * next tick will pick it up again anyway.
 */
export async function redriveStalledJobs(
  deps: IngestDeps,
  staleBefore: Date,
  limit: number,
): Promise<Array<{ jobId: number; outcome: AdvanceOutcome }>> {
  const stalled = await deps.repo.findStalledJobs(staleBefore, limit);
  const results: Array<{ jobId: number; outcome: AdvanceOutcome }> = [];
  for (const job of stalled) {
    results.push({ jobId: job.id, outcome: await advanceIngestJob(deps, job.id) });
  }
  return results;
}

// ============================================================================
// Progressive availability
// ============================================================================

/**
 * Flips a still-ingesting source to 'partial' once enough of its lessons have servable
 * cards — ULM ADR-010, the single best idea in that repo: it DISSOLVES the wait instead of
 * optimising it.
 *
 * Called after every extraction slice AND after every card-generation slice, and it is a one-way
 * latch: a source that has already
 * reached 'partial' (or 'ready', or 'failed') is left alone. Re-evaluating a source out of
 * 'partial' would take a "start learning now" button away from someone mid-session because
 * a later chunk happened to produce nothing.
 *
 * The threshold SCALES with the source (see `computePartialThreshold`). A fixed one is why
 * ULM's own short books, including its onboarding sample, could never reach this state.
 *
 * What has to be true for this to fire is that some lesson has a SERVABLE card, which is why the
 * latch was inert until `generating_cards` existed: the pipeline ended at `merging` and nothing
 * wrote `lesson_cards`, so `countLessonsWithCards` was structurally zero for every source ever
 * ingested. It now fires between two card slices, which is the entire mechanism — the source
 * becomes usable partway through card generation rather than at the end of it.
 */
async function maybeMarkPartial(deps: IngestDeps, job: IngestJobRow): Promise<boolean> {
  const source = await deps.repo.loadSource(job.sourceId);
  if (source?.status !== "processing") return false;

  const threshold = computePartialThreshold(targetLessonCount(source.pageCount));
  const carded = await deps.repo.countLessonsWithCards(job.sourceId);
  if (carded < threshold) return false;

  await deps.repo.saveSource(job.sourceId, { status: "partial" });
  return true;
}

// ============================================================================
// Failure ladder
// ============================================================================

async function recordFailure(deps: IngestDeps, job: IngestJobRow, reason: string): Promise<AdvanceOutcome> {
  const attempts = job.attempts + 1;
  if (attempts >= MAX_STEP_ATTEMPTS) {
    await deps.repo.saveJob(job.id, {
      step: "failed",
      attempts,
      lastError: reason,
      progressCurrent: null,
      progressTotal: null,
    });
    await deps.repo.saveSource(job.sourceId, { status: "failed" });
    return { kind: "failed", reason };
  }
  await deps.repo.saveJob(job.id, { attempts, lastError: reason });
  return { kind: "retry", step: job.step, attempts, reason };
}

/** A hard stop that retrying cannot fix (no file, budget exhausted, a book that produced
 *  nothing). Goes straight to `failed` — burning four more attempts on it would only
 *  delay the honest answer. */
async function failNow(deps: IngestDeps, job: IngestJobRow, reason: string): Promise<AdvanceOutcome> {
  // Progress cleared with the step: 'failed' has no denominator, and leaving the last
  // step's counters behind would show a dead job frozen mid-count.
  await deps.repo.saveJob(job.id, {
    step: "failed",
    lastError: reason,
    progressCurrent: null,
    progressTotal: null,
  });
  await deps.repo.saveSource(job.sourceId, { status: "failed" });
  return { kind: "failed", reason };
}

// ============================================================================
// The steps
// ============================================================================

function runStep(deps: IngestDeps, job: IngestJobRow): Promise<AdvanceOutcome> {
  switch (job.step) {
    case "queued":
      return stepQueued(deps, job);
    case "extracting_text":
      return stepExtractingText(deps, job);
    case "parsing_structure":
      return stepParsingStructure(deps, job);
    case "chunking":
      return stepChunking(deps, job);
    case "embedding":
      return stepEmbedding(deps, job);
    case "extracting_lessons":
      return stepExtractingLessons(deps, job);
    case "merging":
      return stepMerging(deps, job);
    case "generating_cards":
      return stepGeneratingCards(deps, job);
    default:
      return Promise.resolve({ kind: "done" });
  }
}

async function stepQueued(deps: IngestDeps, job: IngestJobRow): Promise<AdvanceOutcome> {
  const source = await deps.repo.loadSource(job.sourceId);
  if (!source) return await failNow(deps, job, "Source row no longer exists.");
  if (!source.storagePath) {
    // Migration 54 allows a source retained only as its lessons. That is a valid source
    // and an impossible ingestion; saying so beats retrying a download of nothing.
    return await failNow(deps, job, "This source has no stored file to ingest.");
  }

  await deps.repo.saveSource(job.sourceId, { status: "processing" });
  await deps.repo.saveJob(job.id, {
    step: "extracting_text",
    cursor: { nextPage: 1, pageCount: null },
    attempts: 0,
    lastError: null,
    // Pages are the unit here, and the denominator is unknown until the first slice reads
    // the document. Null rather than a placeholder: an invented total is the lie a progress
    // bar tells when it reaches 90% and waits.
    progressCurrent: 0,
    progressTotal: null,
  });
  return { kind: "advanced", step: "extracting_text", moreWork: true, note: null };
}

async function stepExtractingText(deps: IngestDeps, job: IngestJobRow): Promise<AdvanceOutcome> {
  const source = await deps.repo.loadSource(job.sourceId);
  if (!source?.storagePath) return await failNow(deps, job, "Source file is no longer available.");

  const nextPage = num(job.cursor, "nextPage", 1);
  const bytes = await deps.repo.downloadSource(source.storagePath);
  const slice = await deps.extractPages(bytes, nextPage, nextPage + TEXT_SLICE_PAGES - 1);

  // Blank pages (plates, dividers, no text layer) are simply not stored:
  // `source_chunks.text` carries a `btrim(text) <> ''` constraint, and an empty row would
  // violate it. Their absence is unambiguous because the page NUMBER is the sort key.
  const pages = slice.pages.filter((p) => p.text.trim().length > 0);
  if (pages.length > 0) await deps.repo.insertPageTexts(job.userId, job.sourceId, pages);

  if (source.pageCount == null) await deps.repo.saveSource(job.sourceId, { pageCount: slice.pageCount });

  const followingPage = nextPage + TEXT_SLICE_PAGES;
  if (followingPage > slice.pageCount) {
    await deps.repo.saveJob(job.id, {
      step: "parsing_structure",
      cursor: { nextPage: 1, pendingTitle: null, pendingPage: null, sortOrder: 0 },
      attempts: 0,
      lastError: null,
      // Reset, not carried: each step counts its OWN unit of work. Structure parsing walks
      // the same pages again, from the top.
      progressCurrent: 0,
      progressTotal: slice.pageCount,
    });
    return { kind: "advanced", step: "parsing_structure", moreWork: true, note: null };
  }

  await deps.repo.saveJob(job.id, {
    cursor: { nextPage: followingPage, pageCount: slice.pageCount },
    attempts: 0,
    lastError: null,
    progressCurrent: Math.min(nextPage + TEXT_SLICE_PAGES - 1, slice.pageCount),
    progressTotal: slice.pageCount,
  });
  return {
    kind: "advanced",
    step: "extracting_text",
    moreWork: true,
    note: `pages ${nextPage}-${Math.min(nextPage + TEXT_SLICE_PAGES - 1, slice.pageCount)} of ${slice.pageCount}`,
  };
}

/**
 * Structure detection, windowed.
 *
 * A section's END is the page before the NEXT heading, so a heading found in this window
 * cannot be closed until the following one is seen. The cursor therefore carries one
 * pending heading across invocations (`pendingTitle`/`pendingPage`) and the final pending
 * heading is closed at the last page when the walk finishes. That is the whole reason
 * this step has a cursor at all rather than reading the book in one go.
 */
async function stepParsingStructure(deps: IngestDeps, job: IngestJobRow): Promise<AdvanceOutcome> {
  const source = await deps.repo.loadSource(job.sourceId);
  const pageCount = source?.pageCount ?? 0;
  const nextPage = num(job.cursor, "nextPage", 1);
  const sortOrder = num(job.cursor, "sortOrder", 0);
  const pendingTitle = typeof job.cursor.pendingTitle === "string" ? job.cursor.pendingTitle : null;
  const pendingPage = num(job.cursor, "pendingPage", 0);

  const lastPageOfWindow = nextPage + CHUNK_WINDOW_PAGES - 1;
  const pages = await deps.repo.loadPageTexts(job.sourceId, nextPage, lastPageOfWindow);
  const headings = detectSections(pages, lastPageOfWindow);

  const toInsert: DetectedSection[] = [];
  let carriedTitle = pendingTitle;
  let carriedPage = pendingPage;
  let order = sortOrder;

  for (const heading of headings) {
    if (carriedTitle != null) {
      toInsert.push({
        title: carriedTitle,
        pageStart: carriedPage,
        pageEnd: Math.max(carriedPage, heading.pageStart - 1),
        sortOrder: order++,
      });
    }
    carriedTitle = heading.title;
    carriedPage = heading.pageStart;
  }

  const finished = lastPageOfWindow >= pageCount;
  if (finished && carriedTitle != null) {
    toInsert.push({
      title: carriedTitle,
      pageStart: carriedPage,
      pageEnd: Math.max(carriedPage, pageCount),
      sortOrder: order++,
    });
    carriedTitle = null;
  }

  if (toInsert.length > 0) await deps.repo.insertSections(job.userId, job.sourceId, toInsert);

  if (finished) {
    await deps.repo.saveJob(job.id, {
      step: "chunking",
      cursor: { nextPage: 1, nextSortOrder: 0 },
      attempts: 0,
      lastError: null,
      progressCurrent: 0,
      progressTotal: pageCount,
    });
    return { kind: "advanced", step: "chunking", moreWork: true, note: null };
  }

  await deps.repo.saveJob(job.id, {
    cursor: {
      nextPage: lastPageOfWindow + 1,
      pendingTitle: carriedTitle,
      pendingPage: carriedTitle == null ? 0 : carriedPage,
      sortOrder: order,
    },
    attempts: 0,
    lastError: null,
    progressCurrent: Math.min(lastPageOfWindow, pageCount),
    progressTotal: pageCount,
  });
  return { kind: "advanced", step: "parsing_structure", moreWork: true, note: null };
}

async function stepChunking(deps: IngestDeps, job: IngestJobRow): Promise<AdvanceOutcome> {
  const source = await deps.repo.loadSource(job.sourceId);
  const pageCount = source?.pageCount ?? 0;
  const nextPage = num(job.cursor, "nextPage", 1);
  const nextSortOrder = num(job.cursor, "nextSortOrder", 0);
  const lastPageOfWindow = nextPage + CHUNK_WINDOW_PAGES - 1;

  const pages = await deps.repo.loadPageTexts(job.sourceId, nextPage, lastPageOfWindow);
  const sections = await deps.repo.loadSections(job.sourceId);
  const sectionShapes: DetectedSection[] = sections.map((s, index) => ({
    title: "",
    pageStart: s.pageStart ?? 1,
    pageEnd: s.pageEnd ?? Number.MAX_SAFE_INTEGER,
    sortOrder: index,
  }));

  const chunks = chunkPages(pages, { startSortOrder: nextSortOrder });
  const rows: NewChunk[] = chunks.map((chunk) => {
    // A chunk belongs to the section its FIRST page is in. Overlap can carry the tail of
    // the previous section into a chunk; attributing it to where the chunk starts is the
    // one rule that stays stable regardless of how the overlap fell.
    const match = sectionForPage(sectionShapes, chunk.pageStart);
    return {
      text: chunk.text,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      sortOrder: chunk.sortOrder,
      sectionId: match ? sections[match.sortOrder]!.id : null,
    };
  });

  if (rows.length > 0) await deps.repo.insertChunks(job.userId, job.sourceId, rows);
  // Consumed. Deleting the staging rows here (not at the end of the step machine) keeps
  // the two forms from coexisting for longer than one window.
  await deps.repo.deletePageTexts(job.sourceId, nextPage, lastPageOfWindow);

  if (lastPageOfWindow >= pageCount) {
    await deps.repo.saveJob(job.id, {
      step: "embedding",
      cursor: { embedded: 0, skipped: false, skippedReason: null },
      attempts: 0,
      lastError: null,
      progressCurrent: 0,
      // Chunks, now — the unit changes with the step, which is the whole reason these
      // counters are reset at every transition rather than accumulated.
      progressTotal: await deps.repo.countChunks(job.sourceId),
    });
    return { kind: "advanced", step: "embedding", moreWork: true, note: null };
  }

  await deps.repo.saveJob(job.id, {
    cursor: { nextPage: lastPageOfWindow + 1, nextSortOrder: nextSortOrder + rows.length },
    attempts: 0,
    lastError: null,
    progressCurrent: Math.min(lastPageOfWindow, pageCount),
    progressTotal: pageCount,
  });
  return { kind: "advanced", step: "chunking", moreWork: true, note: `${rows.length} chunks` };
}

/**
 * THE D41 STEP.
 *
 * With no VOYAGE_API_KEY the step does not fail, does not retry, and does not silently do
 * nothing: it records on the job WHY there are no vectors and advances. Ingestion
 * completes end to end, `source_chunks.embedding` and `lessons.embedding` stay null (which
 * migration 54's own comment says is the expected state), and the merge pass clusters
 * lexically instead. Supplying the key and running a backfill is then the entire
 * activation — no code path first runs on the day the key arrives, because this one runs
 * every time.
 */
async function stepEmbedding(deps: IngestDeps, job: IngestJobRow): Promise<AdvanceOutcome> {
  const advanceToExtraction = async (skipped: boolean, reason: string | null, embedded: number): Promise<AdvanceOutcome> => {
    await deps.repo.saveJob(job.id, {
      step: "extracting_lessons",
      cursor: { afterChunkId: 0, processed: 0, candidates: 0, dropped: 0, embeddingsSkipped: skipped, embeddingsSkippedReason: reason },
      attempts: 0,
      lastError: null,
      progressCurrent: 0,
      progressTotal: await deps.repo.countChunks(job.sourceId),
    });
    return {
      kind: "advanced",
      step: "extracting_lessons",
      moreWork: true,
      note: skipped ? `embeddings skipped: ${reason}` : `${embedded} chunks embedded`,
    };
  };

  const alreadyEmbedded = num(job.cursor, "embedded", 0);

  if (deps.embeddings == null) {
    const result = await embedTexts(null, ["probe"]);
    const reason = result.kind === "deterministicFallback" ? result.reason : "embeddings_unavailable";
    return await advanceToExtraction(true, reason, alreadyEmbedded);
  }

  const chunks = await deps.repo.loadChunksWithoutEmbedding(job.sourceId, EMBED_BATCH_SIZE);
  if (chunks.length === 0) {
    return await advanceToExtraction(bool(job.cursor, "skipped", false), null, alreadyEmbedded);
  }

  const result = await embedTexts(deps.embeddings, chunks.map((c) => c.text), "document");

  if (result.kind === "deterministicFallback") {
    if (result.keyAbsent) {
      // A key that vanished mid-run (rotated, revoked). Same treatment as never having
      // had one: record it, keep going. Retrying cannot make a key appear.
      return await advanceToExtraction(true, result.reason, alreadyEmbedded);
    }
    // A transient provider failure IS retryable, and unlike the absent key it deserves an
    // attempt — but never at the cost of the whole ingestion, which the attempt ladder
    // caps at MAX_STEP_ATTEMPTS before the job fails.
    return await recordFailure(deps, job, `embedding_failed: ${result.reason}`);
  }

  await deps.repo.saveChunkEmbeddings(
    chunks.map((chunk, index) => ({ id: chunk.id, embedding: result.vectors[index]! })),
  );

  await deps.logUsage({
    userId: job.userId,
    callType: "lesson_embedding",
    provider: "voyage",
    model: deps.embeddings.model,
    usage: { inputTokens: result.usage.totalTokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: computeEmbeddingsCostUsd(deps.embeddings.model, result.usage.totalTokens),
    latencyMs: result.latencyMs,
    success: true,
    contentHash: null,
  });

  await deps.repo.saveJob(job.id, {
    cursor: { embedded: alreadyEmbedded + chunks.length, skipped: false, skippedReason: null },
    attempts: 0,
    lastError: null,
    addCostUsd: result.costUsd,
    progressCurrent: alreadyEmbedded + chunks.length,
    progressTotal: await deps.repo.countChunks(job.sourceId),
  });
  return { kind: "advanced", step: "embedding", moreWork: true, note: `${chunks.length} chunks embedded` };
}

async function stepExtractingLessons(deps: IngestDeps, job: IngestJobRow): Promise<AdvanceOutcome> {
  if (deps.gateway == null) {
    // Not a failure and not an attempt: the server is missing a credential, which no
    // amount of retrying by this job will fix, and which an operator fixing it should
    // resume rather than restart. `last_error` says so honestly (D40) instead of the UI
    // showing a stuck progress bar with no explanation.
    const reason = "Lesson extraction is not configured on this server (no Anthropic API key).";
    await deps.repo.saveJob(job.id, { lastError: reason });
    return { kind: "blocked", step: "extracting_lessons", reason };
  }

  const afterChunkId = num(job.cursor, "afterChunkId", 0);
  const candidateTotal = num(job.cursor, "candidates", 0);
  const droppedTotal = num(job.cursor, "dropped", 0);

  const toMerging = async (note: string): Promise<AdvanceOutcome> => {
    await deps.repo.saveJob(job.id, {
      step: "merging",
      cursor: {
        candidates: candidateTotal,
        dropped: droppedTotal,
        embeddingsSkipped: bool(job.cursor, "embeddingsSkipped", false),
        embeddingsSkippedReason: job.cursor.embeddingsSkippedReason ?? null,
      },
      attempts: 0,
      lastError: null,
      // Candidates are the unit for merging. It is a single non-resumable pass, so the
      // counter starts at 0 and reaches the total in one move — which is still worth
      // writing, because it says which denominator the step is working against.
      progressCurrent: 0,
      progressTotal: candidateTotal,
    });
    return { kind: "advanced", step: "merging", moreWork: true, note };
  };

  if (candidateTotal >= MAX_CANDIDATES) {
    return await toMerging(`candidate cap (${MAX_CANDIDATES}) reached`);
  }

  const chunks = await deps.repo.loadChunksAfter(job.sourceId, afterChunkId, EXTRACT_CHUNKS_PER_INVOCATION);
  if (chunks.length === 0) return await toMerging("all chunks processed");

  const budgetCeilingUsd = await deps.repo.loadBudgetCeilingUsd(job.userId);
  const forModel: ChunkForModel[] = chunks.map((c) => ({
    id: c.id,
    text: c.text,
    pageStart: c.pageStart,
    pageEnd: c.pageEnd,
  }));

  const triage = await triageChunks(deps.gateway, {
    userId: job.userId,
    budgetCeilingUsd,
    chunks: forModel.slice(0, TRIAGE_BATCH_SIZE),
  });

  let costUsd = triage.costUsd;
  const keep = new Set(triage.keepIds);
  const rows: NewCandidateLesson[] = [];
  let dropped = 0;

  for (const chunk of forModel) {
    if (!keep.has(chunk.id)) continue;
    const extraction = await extractLessonsFromChunk(deps.gateway, { userId: job.userId, budgetCeilingUsd, chunk });

    if (extraction.kind === "budgetExceeded") {
      // Not retryable within this month, and continuing would produce a partial library
      // presented as a complete one.
      return await failNow(deps, job, "Monthly LLM budget exceeded during lesson extraction.");
    }
    if (extraction.kind === "failed") {
      return await recordFailure(deps, job, `extraction_failed: ${extraction.reason}`);
    }

    costUsd += extraction.costUsd;
    dropped += extraction.dropped.length;
    for (const lesson of extraction.lessons) {
      rows.push({
        title: lesson.title,
        coreClaim: lesson.coreClaim,
        mechanism: lesson.mechanism,
        claimToTask: lesson.claimToTask,
        evidenceStrength: lesson.evidenceStrength,
        provenanceQuote: lesson.provenanceQuote,
        pageRef: lesson.pageRef,
        sectionId: null,
        embedding: null,
      });
    }
  }

  // Candidate lessons are embedded HERE, at creation, rather than in a pass of their own:
  // the merge step clusters lessons (not chunks), so this is where the vector it needs is
  // produced, and the batch is bounded by one invocation's extraction output (tens, not
  // hundreds). On the D41 path this call returns the named absence, every embedding stays
  // null, and the merge pass clusters lexically instead.
  if (rows.length > 0 && deps.embeddings != null) {
    const embedded = await embedTexts(deps.embeddings, rows.map((row) => `${row.title} ${row.coreClaim}`), "document");
    if (embedded.kind === "ok") {
      rows.forEach((row, index) => {
        row.embedding = embedded.vectors[index] ?? null;
      });
      costUsd += embedded.costUsd;
      await deps.logUsage({
        userId: job.userId,
        callType: "lesson_embedding",
        provider: "voyage",
        model: deps.embeddings.model,
        usage: { inputTokens: embedded.usage.totalTokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
        costUsd: embedded.costUsd,
        latencyMs: embedded.latencyMs,
        success: true,
        contentHash: null,
      });
    }
    // A fallback here is deliberately NOT a retry: the lessons are grounded and worth
    // storing, and a lesson with a null embedding is exactly the state the merge pass
    // already knows how to handle.
  }

  if (rows.length > 0) await deps.repo.insertCandidateLessons(job.userId, job.sourceId, rows);

  const highestId = Math.max(...chunks.map((c) => c.id));
  // Counted in the cursor rather than re-queried: chunk ids are not dense (the staging page
  // rows consumed the same identity sequence), so "id <= highestId" is not a count of chunks
  // processed. What this slice actually finished is what this slice actually loaded.
  const processedChunks = num(job.cursor, "processed", 0) + chunks.length;
  await deps.repo.saveJob(job.id, {
    cursor: {
      afterChunkId: highestId,
      processed: processedChunks,
      candidates: candidateTotal + rows.length,
      dropped: droppedTotal + dropped,
      embeddingsSkipped: bool(job.cursor, "embeddingsSkipped", false),
      embeddingsSkippedReason: job.cursor.embeddingsSkippedReason ?? null,
    },
    attempts: 0,
    lastError: null,
    addCostUsd: costUsd,
    progressCurrent: processedChunks,
    progressTotal: await deps.repo.countChunks(job.sourceId),
  });

  // The progressive-availability latch, evaluated after every slice rather than once at the
  // end — that is the entire mechanism. Deliberately AFTER the checkpoint above: the slice's
  // work is durable before the source is advertised as usable, so a crash here costs an
  // announcement, never a chunk.
  const nowPartial = await maybeMarkPartial(deps, job);

  return {
    kind: "advanced",
    step: "extracting_lessons",
    moreWork: true,
    note: `${rows.length} grounded, ${dropped} dropped by the provenance gate${triage.degraded ? `, triage degraded (${triage.reason})` : ""}${nowPartial ? ", source now partial" : ""}`,
  };
}

async function stepMerging(deps: IngestDeps, job: IngestJobRow): Promise<AdvanceOutcome> {
  const source = await deps.repo.loadSource(job.sourceId);
  const candidates = await deps.repo.loadCandidateLessons(job.sourceId);

  if (candidates.length === 0) {
    // Honest, and specifically not "ready with zero lessons": a book that grounded
    // nothing is a failed ingestion the user must see, not an empty library they will
    // assume is a bug in the app.
    return await failNow(
      deps,
      job,
      "No lesson could be grounded in a verbatim passage from this source — nothing was stored.",
    );
  }

  const mergeCandidates: MergeCandidate[] = candidates.map((c) => ({
    id: c.id,
    title: c.title,
    coreClaim: c.coreClaim,
    pageRef: c.pageRef,
    embedding: c.embedding,
  }));

  const plan = buildClusterPlan(mergeCandidates);
  const budgetCeilingUsd = await deps.repo.loadBudgetCeilingUsd(job.userId);

  const selection = await mergeAndRank(deps.gateway, {
    userId: job.userId,
    budgetCeilingUsd,
    candidates: mergeCandidates,
    plan,
    pageCount: source?.pageCount ?? null,
  });

  // PROMOTE the survivors, ARCHIVE the losers. Never delete: a loser's cards may already
  // have been reviewed while the source sat at 'partial', and `lesson_reviews` is the sole
  // source of every FSRS state in the app. Migration 60's trigger suspends an archived
  // lesson's cards, so nothing keeps serving them — the rows just stay reachable.
  if (selection.keepIds.length > 0) await deps.repo.promoteLessons(selection.keepIds);
  if (selection.dropIds.length > 0) await deps.repo.archiveLessons(selection.dropIds);

  // `lesson_count` is settled here because the active set is settled here. The source's STATUS is
  // NOT: it stays 'processing' until cards exist. Flipping to 'ready' at the end of the merge —
  // which is what this step used to do — advertised a finished library that no session could draw
  // a single card from, and it also closed the door on 'partial' forever, since that latch only
  // considers a source still in 'processing'.
  await deps.repo.saveSource(job.sourceId, { lessonCount: selection.keepIds.length });
  await deps.repo.saveJob(job.id, {
    step: "generating_cards",
    cursor: {
      lessons: selection.keepIds.length,
      dropped: selection.dropIds.length,
      similarityMetric: plan.metric,
      embeddingsSkipped: bool(job.cursor, "embeddingsSkipped", false),
      embeddingsSkippedReason: job.cursor.embeddingsSkippedReason ?? null,
      mergeDegraded: selection.degraded,
      mergeDegradedReason: selection.reason,
      // Card generation's own cursor, starting fresh.
      afterLessonId: 0,
      lessonsCarded: 0,
      lessonsWithoutCards: 0,
      cardsWritten: 0,
      invariants: newInvariantCounters(),
      topicalityChecked: null,
    },
    attempts: 0,
    lastError: null,
    addCostUsd: selection.costUsd,
    // Surviving LESSONS are the unit now — the counter is reset at the transition like every
    // other step's, because a denominator of candidates would count rows this step never touches.
    progressCurrent: 0,
    progressTotal: selection.keepIds.length,
  });

  return {
    kind: "advanced",
    step: "generating_cards",
    moreWork: true,
    note: `${selection.keepIds.length} lessons (${plan.metric})`,
  };
}

/**
 * THE STEP THAT MAKES A SESSION POSSIBLE.
 *
 * One slice of surviving lessons per invocation, one model call per lesson, checkpointed after
 * EVERY lesson rather than once per slice. The finer checkpoint is not gold-plating: `insertCards`
 * is not idempotent, so a slice-level cursor would mean an invocation killed after its third
 * lesson re-cards the first two on resume and the reader meets the same question twice. Per-lesson
 * it costs one small job write and the worst case shrinks to one lesson's cards.
 *
 * It is also the step ULM's own timed run sat silently inside for the last thirteen minutes of a
 * fifty-seven minute ingestion, which is why the progress counters advance within the slice too.
 */
async function stepGeneratingCards(deps: IngestDeps, job: IngestJobRow): Promise<AdvanceOutcome> {
  if (deps.gateway == null) {
    // D45's REFUSAL, and it is the same shape as extraction's block for the same reason: a missing
    // server credential is not this job's defect, so it burns no attempt and the job resumes from
    // its own cursor the moment an operator supplies the key.
    //
    // What it refuses is worth stating, because the tempting alternative looks harmless: cloze
    // cards are deterministic and could be written right now with no key at all. A deck of nothing
    // but fill-in-the-blank cards is recognition practice, and it is INDISTINGUISHABLE from a good
    // deck to the person using it — they would review it for months before noticing they had
    // learned nothing. Blocking is visible today; that is the whole argument.
    const reason = "Card generation is not configured on this server (no Anthropic API key). " +
      "Cloze cards are deterministic, but free-recall, application and why cards are not, and a " +
      "deck of fill-in-the-blank cards alone is recognition practice rather than retrieval practice.";
    await deps.repo.saveJob(job.id, { lastError: reason });
    return { kind: "blocked", step: "generating_cards", reason };
  }

  const counters = readCounters(job.cursor);
  let afterLessonId = num(job.cursor, "afterLessonId", 0);
  let lessonsCarded = num(job.cursor, "lessonsCarded", 0);
  let lessonsWithoutCards = num(job.cursor, "lessonsWithoutCards", 0);
  let cardsWritten = num(job.cursor, "cardsWritten", 0);
  let topicalityChecked = typeof job.cursor.topicalityChecked === "boolean" ? job.cursor.topicalityChecked : null;

  /** Everything the merge pass recorded, carried through to the terminal cursor unchanged. */
  const carried = {
    lessons: num(job.cursor, "lessons", 0),
    dropped: num(job.cursor, "dropped", 0),
    similarityMetric: job.cursor.similarityMetric ?? null,
    embeddingsSkipped: bool(job.cursor, "embeddingsSkipped", false),
    embeddingsSkippedReason: job.cursor.embeddingsSkippedReason ?? null,
    mergeDegraded: bool(job.cursor, "mergeDegraded", false),
    mergeDegradedReason: job.cursor.mergeDegradedReason ?? null,
  };

  const progressTotal = await deps.repo.countActiveLessons(job.sourceId);

  const cardCursor = () => ({
    ...carried,
    afterLessonId,
    lessonsCarded,
    lessonsWithoutCards,
    cardsWritten,
    invariants: { ...counters },
    topicalityChecked,
  });

  const lessons = await deps.repo.loadActiveLessonsAfter(job.sourceId, afterLessonId, CARD_LESSONS_PER_INVOCATION);

  if (lessons.length === 0) {
    if (cardsWritten === 0) {
      // The same honesty rule `merging` applies to a book that grounded nothing, one step later: a
      // library of lessons with not one reviewable card is a failed ingestion the user must see,
      // never a 'ready' source they will assume the app is broken for showing empty.
      return await failNow(
        deps,
        job,
        "No card survived the quality gates for any lesson in this source — there is nothing to review.",
      );
    }

    await deps.repo.saveSource(job.sourceId, { status: "ready" });
    await deps.repo.saveJob(job.id, {
      step: "done",
      // Progress cleared: 'done' has no unit of work left to count, and 60-of-60 frozen on a
      // finished job reads as a stall to anyone who does not know the step machine.
      progressCurrent: null,
      progressTotal: null,
      cursor: cardCursor(),
      attempts: 0,
      lastError: null,
    });
    return {
      kind: "advanced",
      step: "done",
      moreWork: false,
      note: `${cardsWritten} cards on ${lessonsCarded} lessons`,
    };
  }

  const budgetCeilingUsd = await deps.repo.loadBudgetCeilingUsd(job.userId);
  let costUsd = 0;

  for (const lesson of lessons) {
    const outcome = await generateCardsForLesson(deps.gateway, {
      userId: job.userId,
      budgetCeilingUsd,
      lesson,
      embeddings: deps.embeddings,
      counters,
    });

    if (outcome.kind === "budgetExceeded") {
      // Not retryable this month, and the same call `extracting_lessons` makes: continuing would
      // leave a deck that is complete for the first forty lessons and empty for the rest, presented
      // as a finished book.
      return await failNow(deps, job, "Monthly LLM budget exceeded during card generation.");
    }
    if (outcome.kind === "failed") {
      // Whatever this slice already wrote is durable and its cursor already reflects it, so the
      // retry resumes at the lesson that failed rather than re-carding the ones that did not.
      await deps.repo.saveJob(job.id, { cursor: cardCursor(), addCostUsd: costUsd });
      return await recordFailure(deps, job, `card_generation_failed: ${outcome.reason}`);
    }

    costUsd += outcome.costUsd;
    // `false` is sticky: one slice that could not check topicality means the BOOK's cards were
    // not uniformly checked, and the record has to say the weaker of the two things.
    topicalityChecked = topicalityChecked === false ? false : outcome.topicalityChecked;

    if (outcome.cards.length > 0) {
      await deps.repo.insertCards(job.userId, lesson.id, outcome.cards);
      lessonsCarded++;
      cardsWritten += outcome.cards.length;
    } else {
      // A lesson nothing usable could be written for stays ACTIVE and simply never enters a
      // queue. Archiving it would be a quality judgement on the lesson made by a failure of the
      // card writer, and it would take a real, grounded, readable lesson out of the library.
      lessonsWithoutCards++;
    }

    afterLessonId = lesson.id;

    await deps.repo.saveJob(job.id, {
      cursor: cardCursor(),
      attempts: 0,
      lastError: null,
      addCostUsd: costUsd,
      progressCurrent: lessonsCarded + lessonsWithoutCards,
      progressTotal,
    });
    costUsd = 0; // already accumulated onto the job; never added twice
  }

  // The progressive-availability latch, after the checkpoint: the slice's cards are durable before
  // the source is advertised as usable, so a crash here costs an announcement, never a card.
  const nowPartial = await maybeMarkPartial(deps, job);

  return {
    kind: "advanced",
    step: "generating_cards",
    moreWork: true,
    note: `${cardsWritten} cards on ${lessonsCarded} lessons${
      lessonsWithoutCards > 0 ? `, ${lessonsWithoutCards} lessons produced none` : ""
    }${nowPartial ? ", source now partial" : ""}`,
  };
}
