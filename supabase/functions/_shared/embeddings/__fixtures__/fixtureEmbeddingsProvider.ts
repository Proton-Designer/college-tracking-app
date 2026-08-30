// Offline, no-key, no-cost fakes for EmbeddingsProvider — the exact counterpart of
// _shared/llm/__fixtures__/fixtureProvider.ts, and for the same reason: no test in this
// repo may depend on a credential that does not exist.
//
// Two fakes, because they answer different questions:
//
//   createFixtureEmbeddingsProvider  — scripted responses in order. For asserting how a
//     caller handles ok / deterministicFallback / a mid-batch failure.
//   createDeterministicEmbeddingsProvider — a real (if crude) hashing embedder. Similar
//     text genuinely produces a similar vector, so the EMBEDDING similarity path can be
//     exercised end to end offline instead of only the lexical one. Without this, the
//     cosine branch of the merge pass would have no test at all until a key existed —
//     which is precisely the "code path first exercised on the day the key arrives"
//     failure D41 exists to prevent.

import { VOYAGE_DIMENSIONS, type EmbeddingsInputType, type EmbeddingsProvider, type EmbeddingsResult } from "../types.ts";
import { tokenize } from "../lexicalSimilarity.ts";

export type FixtureEmbeddingsResponse =
  | { kind: "ok"; vectors: number[][]; totalTokens?: number }
  | { kind: "fallback"; reason: string; keyAbsent?: boolean };

export interface RecordedEmbedCall {
  texts: string[];
  inputType: EmbeddingsInputType;
}

/** Returns each configured response in order, one per `embed()`; the last one repeats
 *  once the list is exhausted. Records every call so a test can assert on what was
 *  actually sent (batch sizes, input_type), not just on the return value. */
export function createFixtureEmbeddingsProvider(
  responses: FixtureEmbeddingsResponse[],
): EmbeddingsProvider & { calls: () => RecordedEmbedCall[] } {
  let index = 0;
  const calls: RecordedEmbedCall[] = [];

  return {
    model: "voyage-3.5-lite",
    dimensions: VOYAGE_DIMENSIONS,
    calls: () => calls,
    embed(texts: string[], inputType: EmbeddingsInputType): Promise<EmbeddingsResult> {
      calls.push({ texts, inputType });
      const response = responses[Math.min(index, responses.length - 1)];
      index++;
      if (!response) {
        return Promise.resolve({
          kind: "deterministicFallback",
          reason: "fixtureEmbeddingsProvider: no responses configured",
          keyAbsent: false,
        });
      }
      if (response.kind === "fallback") {
        return Promise.resolve({
          kind: "deterministicFallback",
          reason: response.reason,
          keyAbsent: response.keyAbsent ?? false,
        });
      }
      return Promise.resolve({
        kind: "ok",
        vectors: response.vectors,
        usage: { totalTokens: response.totalTokens ?? 100 },
        costUsd: 0,
        latencyMs: 1,
      });
    },
  };
}

/** FNV-1a. Small, dependency-free, and well-spread enough that two different tokens
 *  landing in the same bucket is rare at 1024 buckets. */
function hashToken(token: string): number {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * A bag-of-words hashing embedder, L2-normalised. Not a semantic model — two paraphrases
 * with no shared vocabulary get orthogonal vectors, exactly as they would under Jaccard.
 * What it DOES provide is a real 1024-dimensional vector whose cosine similarity behaves
 * monotonically with token overlap, which is all the clustering path needs to be tested.
 */
export function createDeterministicEmbeddingsProvider(): EmbeddingsProvider & { calls: () => RecordedEmbedCall[] } {
  const calls: RecordedEmbedCall[] = [];
  return {
    model: "voyage-3.5-lite",
    dimensions: VOYAGE_DIMENSIONS,
    calls: () => calls,
    embed(texts: string[], inputType: EmbeddingsInputType): Promise<EmbeddingsResult> {
      calls.push({ texts, inputType });
      const vectors = texts.map((text) => {
        const vector = new Array<number>(VOYAGE_DIMENSIONS).fill(0);
        for (const token of tokenize(text)) {
          vector[hashToken(token) % VOYAGE_DIMENSIONS] += 1;
        }
        const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
        return norm === 0 ? vector : vector.map((v) => v / norm);
      });
      return Promise.resolve({
        kind: "ok",
        vectors,
        usage: { totalTokens: texts.reduce((sum, t) => sum + Math.ceil(t.length / 4), 0) },
        costUsd: 0,
        latencyMs: 1,
      });
    },
  };
}
