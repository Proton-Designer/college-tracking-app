// The Learn ingestion contracts: the model-facing schemas, the cursor shapes migration
// 54's `ingest_jobs.cursor` comment defers to ("shape depends on the step and is
// documented at each writer"), and the tuning constants with the reasoning attached.
//
// Wire schema AND Zod schema are both stated, deliberately duplicated, exactly as
// _shared/syllabus/extract.ts documents: the wire schema is the contract the model is
// TOLD (commit 60e3703 proved a loose one produces rich data under invented key names),
// and the Zod schema is the gate that actually decides. They are one contract written
// twice; if one changes the other must.

import { z } from "zod";

// ============================================================================
// Step tuning — every number here has a consumer it was chosen against
// ============================================================================

/** Pages extracted per `extracting_text` invocation. 25 pages of dense prose is ~50k
 *  characters and a small number of PDF.js page renders — comfortably inside an Edge
 *  Function's wall clock with room for the download, while keeping a 300-page book to
 *  12 invocations rather than 300. */
export const TEXT_SLICE_PAGES = 25;

/** Pages coalesced into chunks per `chunking` invocation. Larger than the text slice
 *  because chunking is pure CPU over text already in the database. The cost of the
 *  window is that a chunk never spans a window boundary, so ~1 chunk per 50 pages loses
 *  its overlap — accepted rather than holding the whole book in memory. */
export const CHUNK_WINDOW_PAGES = 50;

/** Chunks embedded per `embedding` invocation. Voyage's per-request cap is 128; 64
 *  leaves headroom under the token-per-request limit for chunks at the top of the size
 *  distribution. */
export const EMBED_BATCH_SIZE = 64;

/** Chunks triaged per `lesson_triage` call. Batching is the entire economy of the triage
 *  step: one Haiku call decides 8 chunks' fate, and the Sonnet extraction then runs only
 *  on survivors. */
export const TRIAGE_BATCH_SIZE = 8;

/** Chunks extracted per `extracting_lessons` invocation. One triage batch plus its
 *  surviving extraction calls, so a single invocation is bounded at
 *  1 + TRIAGE_BATCH_SIZE model calls. */
export const EXTRACT_CHUNKS_PER_INVOCATION = TRIAGE_BATCH_SIZE;

// The lesson-count targets used to live here as a second copy. They are pure arithmetic over a
// page count, so law 2 puts them in packages/core (`learn/ingestionTargets.ts`) and this file
// re-exports them — one definition, one test suite, mirrored into Deno by
// `npm run build:core-for-deno` like the rest of the domain engine.
export {
  LESSON_CAP,
  LESSON_FLOOR,
  PAGES_PER_LESSON,
  PARTIAL_THRESHOLD_CEILING,
  PARTIAL_THRESHOLD_FLOOR,
  computePartialThreshold,
  targetLessonCount,
} from "../core/index.ts";

/**
 * Near-duplicate threshold for the merge pass's clustering.
 *
 * 0.45 Jaccard over stopworded tokens: two sentences stating the same lesson in different
 * words typically land 0.4–0.7, while two different lessons from the same chapter (which
 * DO share vocabulary — the book's topic words) land under 0.3. Deliberately not lower:
 * single-link clustering chains, and a threshold that merges "same chapter" into "same
 * lesson" would hand the merge pass one giant cluster and destroy the book's variety.
 *
 * The cosine threshold is separate and higher because cosine over dense embeddings has a
 * much higher floor — unrelated English text sits around 0.3–0.5, so 0.45 there would
 * cluster everything.
 */
export const LEXICAL_DUPLICATE_THRESHOLD = 0.45;
export const COSINE_DUPLICATE_THRESHOLD = 0.82;

/** How long a job may go without a heartbeat before the cron re-drives it. Generous
 *  relative to a single step (seconds) and short relative to a user's patience. */
export const STALL_MINUTES = 5;

/** Attempts at one step before the job is failed. Five is chosen against the failure it
 *  is actually protecting against — a transient provider error — not against a bug,
 *  which retrying cannot fix. */
export const MAX_STEP_ATTEMPTS = 5;

/** Hard ceiling on candidate lessons held for one source. A book that produces 2,000
 *  candidates is a triage failure, not a rich book, and the merge prompt has to fit. */
export const MAX_CANDIDATES = 400;

// ============================================================================
// Cursor shapes — migration 54's `ingest_jobs.cursor` per step
// ============================================================================

/** `extracting_text`: the next page to extract, and the document's real page count once
 *  the first slice has told us. */
export const TextCursorSchema = z.object({
  nextPage: z.number().int().positive().default(1),
  pageCount: z.number().int().positive().nullable().default(null),
});

/** `chunking`: the next page window to coalesce, and the running global sort_order so
 *  chunk ordering stays monotonic across invocations. */
export const ChunkCursorSchema = z.object({
  nextPage: z.number().int().positive().default(1),
  nextSortOrder: z.number().int().min(0).default(0),
});

/** `embedding`: how many chunks are done, plus — the D41 record — whether embeddings were
 *  skipped and why. `skippedReason` is written on the job, not thrown away, so "this
 *  source has no vectors" is a fact the backfill can find later. */
export const EmbedCursorSchema = z.object({
  embedded: z.number().int().min(0).default(0),
  skipped: z.boolean().default(false),
  skippedReason: z.string().nullable().default(null),
});

/** `extracting_lessons`: the highest chunk id already processed. Keyed by id, not by
 *  offset, so a concurrent insert cannot make the cursor skip a chunk. */
export const ExtractCursorSchema = z.object({
  afterChunkId: z.number().int().min(0).default(0),
  candidates: z.number().int().min(0).default(0),
  dropped: z.number().int().min(0).default(0),
});

// ============================================================================
// Triage — the cheap gate
// ============================================================================

export const TriageResultSchema = z.object({
  chunks: z.array(
    z.object({
      index: z.number().int().min(0),
      hasLessons: z.boolean(),
    }),
  ),
});
export type TriageResult = z.infer<typeof TriageResultSchema>;

export const TRIAGE_TOOL_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    chunks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer", minimum: 0 },
          hasLessons: { type: "boolean" },
        },
        required: ["index", "hasLessons"],
        additionalProperties: false,
      },
    },
  },
  required: ["chunks"],
  additionalProperties: false,
};

// ============================================================================
// Extraction — candidate lessons from ONE chunk
// ============================================================================

export const EVIDENCE_STRENGTHS = ["author_anecdote", "single_study", "strong_research"] as const;

export const CandidateLessonSchema = z.object({
  title: z.string().min(1),
  coreClaim: z.string().min(1),
  mechanism: z.string().nullable(),
  /** The seam to Desired Self (migration 54's own comment): a lesson proposes a
   *  behaviour, trying it becomes an `experiments` row. */
  claimToTask: z.string().nullable(),
  evidenceStrength: z.enum(EVIDENCE_STRENGTHS).nullable(),
  /** The model's CLAIM about where this came from. Never stored as given — ingestion
   *  looks it up in the chunk and stores the chunk's own substring, or drops the lesson.
   *  See provenance.ts. */
  provenanceQuote: z.string(),
});
export type CandidateLesson = z.infer<typeof CandidateLessonSchema>;

export const ExtractionResultSchema = z.object({
  lessons: z.array(CandidateLessonSchema),
});
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

export const EXTRACTION_TOOL_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    lessons: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string", minLength: 1 },
          coreClaim: { type: "string", minLength: 1 },
          mechanism: { type: ["string", "null"] },
          claimToTask: { type: ["string", "null"] },
          evidenceStrength: { enum: [...EVIDENCE_STRENGTHS, null] },
          provenanceQuote: { type: "string", minLength: 1 },
        },
        required: ["title", "coreClaim", "mechanism", "claimToTask", "evidenceStrength", "provenanceQuote"],
        additionalProperties: false,
      },
    },
  },
  required: ["lessons"],
  additionalProperties: false,
};

// ============================================================================
// Merge — whole-book dedupe and ranking over CANDIDATE IDS ONLY
// ============================================================================

/** The model returns ids and an order. It never returns lesson TEXT, so there is no
 *  channel through which the merge pass could introduce content that never passed the
 *  provenance gate. Anything it returns that is not a real candidate id is discarded by
 *  the caller. */
export const MergeResultSchema = z.object({
  keep: z.array(
    z.object({
      id: z.number().int().positive(),
      /** 1 = most worth remembering. Deterministic code applies the floor and the cap
       *  (D9: the model orders; code decides how many). */
      rank: z.number().int().positive(),
    }),
  ),
});
export type MergeResult = z.infer<typeof MergeResultSchema>;

export const MERGE_TOOL_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    keep: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "integer", minimum: 1 },
          rank: { type: "integer", minimum: 1 },
        },
        required: ["id", "rank"],
        additionalProperties: false,
      },
    },
  },
  required: ["keep"],
  additionalProperties: false,
};

// `targetLessonCount` and `computePartialThreshold` are re-exported at the top of this file from
// packages/core. See the note there.
