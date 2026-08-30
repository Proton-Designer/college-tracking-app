// The embeddings provider contract — D41.
//
// Anthropic ships no embeddings API, so ULM's pgvector plan needs a second vendor. The
// key does not exist on this machine and will not during this build, so the SHAPE of
// this interface is what carries the decision: absence is a named, returned state, never
// a thrown error and never a silent skip.
//
// Deliberately mirrors the LLM gateway's `GatewayResult` union rather than inventing a
// second vocabulary: `{kind: "ok", ...}` on success and `{kind: "deterministicFallback",
// reason}` on every non-success, so a call site that already knows how to degrade an
// Anthropic call knows how to degrade this one. `keyAbsent` is the one addition — the
// difference between "we were never configured for this" (permanent until an operator
// acts; not retryable; the D41 path) and "the call failed this time" (retryable) is
// real, and collapsing them would make the re-driver retry a job forever against a
// vendor nobody has signed up with.

export type EmbeddingsModel = "voyage-3.5-lite";

export interface EmbeddingsUsage {
  /** Voyage bills on tokens embedded; there is no output side. */
  totalTokens: number;
}

export interface EmbeddingsSuccess {
  kind: "ok";
  /** One vector per input text, in input order. Length is always `dimensions`. */
  vectors: number[][];
  usage: EmbeddingsUsage;
  costUsd: number;
  latencyMs: number;
}

export interface EmbeddingsUnavailable {
  kind: "deterministicFallback";
  /** Short and safe — never a raw provider body, which could echo request content back
   *  into a log sink. Same rule as the gateway's DeterministicFallback.reason. */
  reason: string;
  /** True only when no key is configured at all (D41's first-class state). The caller
   *  records it on the job and proceeds with the deterministic path; it must NOT count
   *  as a failed attempt, because retrying cannot make a key appear. */
  keyAbsent: boolean;
}

export type EmbeddingsResult = EmbeddingsSuccess | EmbeddingsUnavailable;

/** Voyage distinguishes the two at embedding time; a document embedded as a query is a
 *  measurably worse vector, so this is not cosmetic. */
export type EmbeddingsInputType = "document" | "query";

export interface EmbeddingsProvider {
  readonly model: EmbeddingsModel;
  /** 1024 for voyage-3.5-lite — and the width of `source_chunks.embedding` /
   *  `lessons.embedding` (migration 54). A provider whose vectors are a different width
   *  can never be stored, so the width is part of the contract, not a detail. */
  readonly dimensions: number;
  embed(texts: string[], inputType: EmbeddingsInputType): Promise<EmbeddingsResult>;
}

/** voyage-3.5-lite's native output width, and the column width in migration 54. */
export const VOYAGE_DIMENSIONS = 1024;

/** Voyage's documented per-request input cap. Callers batch to this; the provider
 *  refuses rather than silently truncating, because a silently-dropped chunk is a
 *  lesson nobody knows is missing. */
export const VOYAGE_MAX_BATCH = 128;
