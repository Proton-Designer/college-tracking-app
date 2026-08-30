// What one book costs to ingest, computed from the SAME pricing tables the real calls
// bill against — not a paragraph of arithmetic in a report that goes stale the first time
// a rate changes.
//
// Migration 54's `ingest_jobs.cost_usd` comment sets the bar: the brief's $0.50–$1.50
// target is to be "validated against three real books before anything is optimised,
// rather than discovered as a monthly total". This function is the PREDICTION; that
// column is the measurement. Having both means the first real book either confirms the
// model of the pipeline's economics or shows exactly which term was wrong.

import { computeCostUsd } from "../llm/costs.ts";
import { computeEmbeddingsCostUsd } from "../embeddings/costs.ts";
import type { EmbeddingsModel } from "../embeddings/types.ts";
import { EXTRACT_CHUNKS_PER_INVOCATION, TRIAGE_BATCH_SIZE, targetLessonCount } from "./types.ts";

export interface IngestionCostAssumptions {
  pageCount: number;
  /** Characters of extracted text per page. 2,000 is a trade paperback page of prose. */
  charsPerPage: number;
  /** chunking.ts's target. */
  chunkChars: number;
  /** Share of chunks triage sends to the mid-tier model. 0.6 is the working assumption:
   *  front matter, recaps, exercises, bibliography and transitional prose are a large
   *  minority of a self-improvement book. THE MOST UNCERTAIN NUMBER HERE — it moves the
   *  total more than anything else, and the first real book measures it directly
   *  (extraction calls ÷ chunk count). */
  triagePassRate: number;
  /** Output tokens per extraction call. ~4 lessons of a few sentences each. */
  extractionOutputTokens: number;
  /** Candidate lessons produced per passing chunk. */
  candidatesPerPassingChunk: number;
  embeddingsAvailable: boolean;
  embeddingsModel: EmbeddingsModel;
}

export const DEFAULT_ASSUMPTIONS: IngestionCostAssumptions = {
  pageCount: 300,
  charsPerPage: 2_000,
  chunkChars: 3_500,
  triagePassRate: 0.6,
  extractionOutputTokens: 500,
  candidatesPerPassingChunk: 1.5,
  embeddingsAvailable: false,
  embeddingsModel: "voyage-3.5-lite",
};

export interface IngestionCostBreakdown {
  chunks: number;
  triageCalls: number;
  extractionCalls: number;
  triageUsd: number;
  extractionUsd: number;
  mergeUsd: number;
  embeddingsUsd: number;
  totalUsd: number;
}

/** The repo-wide crude token rule (`chars/4`), used here so the estimate and the budget
 *  pre-flight speak the same units. */
const tokens = (chars: number) => Math.ceil(chars / 4);

export function estimateIngestionCostUsd(
  now: Date,
  overrides: Partial<IngestionCostAssumptions> = {},
): IngestionCostBreakdown {
  const a = { ...DEFAULT_ASSUMPTIONS, ...overrides };

  const totalChars = a.pageCount * a.charsPerPage;
  const chunks = Math.max(1, Math.ceil(totalChars / a.chunkChars));

  // Triage: every chunk's text passes through a Haiku call once, batched.
  const triageCalls = Math.ceil(chunks / TRIAGE_BATCH_SIZE);
  const triageUsd = computeCostUsd(
    "claude-haiku-4-5",
    {
      inputTokens: tokens(totalChars),
      // One short verdict object per chunk.
      outputTokens: chunks * 20,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    now,
  );

  // Extraction: one Sonnet call per surviving chunk.
  const extractionCalls = Math.round(chunks * a.triagePassRate);
  const extractionUsd = computeCostUsd(
    "claude-sonnet-5",
    {
      inputTokens: extractionCalls * tokens(a.chunkChars),
      outputTokens: extractionCalls * a.extractionOutputTokens,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    now,
  );

  // Merge: one Sonnet call over candidate METADATA plus clusters. Bounded by the
  // candidate count, not by the book — which is the whole reason it is affordable.
  const candidates = Math.round(extractionCalls * a.candidatesPerPassingChunk);
  const mergeUsd = computeCostUsd(
    "claude-sonnet-5",
    {
      // ~120 tokens of title + claim + page per candidate, plus the cluster lists.
      inputTokens: candidates * 120 + 500,
      outputTokens: targetLessonCount(a.pageCount) * 15,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    now,
  );

  // Embeddings: every chunk once, plus every candidate lesson once. Rounding error next
  // to the model calls — which is exactly why the D41 no-key path costs nothing to run
  // and the key costs almost nothing to switch on.
  const embeddingsUsd = a.embeddingsAvailable
    ? computeEmbeddingsCostUsd(a.embeddingsModel, tokens(totalChars) + candidates * 60)
    : 0;

  const totalUsd = Math.round((triageUsd + extractionUsd + mergeUsd + embeddingsUsd) * 1e6) / 1e6;
  return { chunks, triageCalls, extractionCalls, triageUsd, extractionUsd, mergeUsd, embeddingsUsd, totalUsd };
}

/** Invocations the state machine needs for one book — the other half of the economics,
 *  since Edge Function invocations are the thing the "one step per call" rule spends. */
export function estimateInvocationCount(assumptions: Partial<IngestionCostAssumptions> = {}): number {
  const a = { ...DEFAULT_ASSUMPTIONS, ...assumptions };
  const chunks = Math.max(1, Math.ceil((a.pageCount * a.charsPerPage) / a.chunkChars));
  const textSlices = Math.ceil(a.pageCount / 25);
  const structureWindows = Math.ceil(a.pageCount / 50);
  const chunkWindows = Math.ceil(a.pageCount / 50);
  const embedBatches = a.embeddingsAvailable ? Math.ceil(chunks / 64) : 1;
  const extractionInvocations = Math.ceil(chunks / EXTRACT_CHUNKS_PER_INVOCATION);
  return 1 + textSlices + structureWindows + chunkWindows + embedBatches + extractionInvocations + 1;
}
