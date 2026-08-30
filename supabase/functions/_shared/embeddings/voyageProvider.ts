// The live Voyage AI implementation of EmbeddingsProvider.
//
// NOT live-tested in this environment (no VOYAGE_API_KEY) — the same honest position
// _shared/llm/anthropicProvider.ts is in. What IS tested here, against a stubbed
// `fetch`, is every branch that decides whether a vector is safe to store: the request
// shape, the non-2xx path, the network-error path, the malformed-body path, and the
// wrong-dimension path.
//
// This provider NEVER throws. A thrown error at an ingestion step would be indistinguishable
// from a bug and would burn a retry attempt; a returned `deterministicFallback` is a state
// the state machine can record and reason about.

import { computeEmbeddingsCostUsd } from "./costs.ts";
import {
  VOYAGE_DIMENSIONS,
  VOYAGE_MAX_BATCH,
  type EmbeddingsInputType,
  type EmbeddingsProvider,
  type EmbeddingsResult,
} from "./types.ts";

const VOYAGE_EMBEDDINGS_URL = "https://api.voyageai.com/v1/embeddings";
/** A hung embedding batch must fail rather than hold a lease forever. */
const REQUEST_TIMEOUT_MS = 30_000;

const MODEL = "voyage-3.5-lite" as const;

interface VoyageResponseBody {
  data?: Array<{ embedding?: unknown; index?: number }>;
  usage?: { total_tokens?: number };
}

export function createVoyageProvider(apiKey: string, fetchImpl: typeof fetch = fetch): EmbeddingsProvider {
  return {
    model: MODEL,
    dimensions: VOYAGE_DIMENSIONS,

    async embed(texts: string[], inputType: EmbeddingsInputType): Promise<EmbeddingsResult> {
      if (texts.length === 0) {
        return { kind: "ok", vectors: [], usage: { totalTokens: 0 }, costUsd: 0, latencyMs: 0 };
      }
      if (texts.length > VOYAGE_MAX_BATCH) {
        // Refused, not truncated. Silently embedding the first 128 of 200 chunks would
        // leave 72 chunks with a null embedding that nothing ever notices — the exact
        // "silent skip" D41 rules out.
        return {
          kind: "deterministicFallback",
          reason: `batch_too_large: ${texts.length} texts exceeds the ${VOYAGE_MAX_BATCH} per-request cap`,
          keyAbsent: false,
        };
      }

      const startedAt = Date.now();
      let response: Response;
      try {
        response = await fetchImpl(VOYAGE_EMBEDDINGS_URL, {
          // Same reasoning as the Anthropic provider: a hung request with no timeout, plus a
          // progress-independent heartbeat, is an immortal job. Shorter here because an
          // embedding batch is a much smaller unit of work than an extraction.
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({ model: MODEL, input: texts, input_type: inputType }),
        });
      } catch (err) {
        return {
          kind: "deterministicFallback",
          reason: `provider_unreachable: ${err instanceof Error ? err.message : String(err)}`,
          keyAbsent: false,
        };
      }

      if (!response.ok) {
        // Status only, never the body: a provider error body can echo the submitted text
        // back, and this reason string lands in ingest_jobs.last_error.
        return {
          kind: "deterministicFallback",
          reason: `provider_status_${response.status}`,
          keyAbsent: false,
        };
      }

      let body: VoyageResponseBody;
      try {
        body = (await response.json()) as VoyageResponseBody;
      } catch {
        return { kind: "deterministicFallback", reason: "provider_body_not_json", keyAbsent: false };
      }

      const rows = body.data;
      if (!Array.isArray(rows) || rows.length !== texts.length) {
        return {
          kind: "deterministicFallback",
          reason: `provider_returned_${Array.isArray(rows) ? rows.length : 0}_vectors_for_${texts.length}_texts`,
          keyAbsent: false,
        };
      }

      // Voyage documents `index` on each row; sort by it rather than trusting array
      // order, because a vector attached to the wrong chunk is worse than no vector —
      // it produces confident, wrong near-duplicate clusters in the merge pass.
      const ordered = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

      const vectors: number[][] = [];
      for (const row of ordered) {
        const vector = row.embedding;
        if (!Array.isArray(vector) || vector.length !== VOYAGE_DIMENSIONS || !vector.every((n) => typeof n === "number" && Number.isFinite(n))) {
          return {
            kind: "deterministicFallback",
            reason: `provider_vector_shape_mismatch: expected ${VOYAGE_DIMENSIONS} finite numbers`,
            keyAbsent: false,
          };
        }
        vectors.push(vector as number[]);
      }

      const totalTokens = typeof body.usage?.total_tokens === "number" ? body.usage.total_tokens : 0;
      return {
        kind: "ok",
        vectors,
        usage: { totalTokens },
        costUsd: computeEmbeddingsCostUsd(MODEL, totalTokens),
        latencyMs: Date.now() - startedAt,
      };
    },
  };
}
