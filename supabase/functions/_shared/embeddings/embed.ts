// The one entry point every embedding call site uses. Its whole job is to make D41's
// absent-key path a NORMAL, always-exercised code path rather than a branch that first
// runs on the day someone pastes a key into the dashboard.
//
// `resolveEmbeddingsProvider()` returns `null` when no key is configured. `embedTexts()`
// accepts that null and returns a `deterministicFallback` with `keyAbsent: true`. So the
// no-key path is one function call, tested directly, and the caller's degrade branch is
// the same branch that handles a provider outage.

import { createVoyageProvider } from "./voyageProvider.ts";
import type { EmbeddingsInputType, EmbeddingsProvider, EmbeddingsResult, EmbeddingsUnavailable } from "./types.ts";

export const EMBEDDINGS_KEY_ABSENT_REASON = "embeddings_key_absent: VOYAGE_API_KEY is not configured";

/** The named absence value. Exported so tests and call sites compare against one
 *  constant instead of matching on a string spelled slightly differently in each file. */
export function embeddingsKeyAbsent(): EmbeddingsUnavailable {
  return { kind: "deterministicFallback", reason: EMBEDDINGS_KEY_ABSENT_REASON, keyAbsent: true };
}

/**
 * `null` means "no key configured" — an ordinary, expected return, not a failure.
 *
 * `getEnv` is injected (defaulting to Deno.env) so this resolves without an env
 * permission in tests, and so a test can assert BOTH branches without mutating process
 * state that another test in the same process would see.
 */
export function resolveEmbeddingsProvider(
  getEnv: (key: string) => string | undefined = (key) => Deno.env.get(key),
): EmbeddingsProvider | null {
  const key = getEnv("VOYAGE_API_KEY");
  if (key == null || key.trim().length === 0) return null;
  return createVoyageProvider(key.trim());
}

/**
 * Embed a batch. An empty input is a trivial success (no call, no cost) rather than an
 * error — callers slice their work into batches and an empty tail is normal.
 */
export function embedTexts(
  provider: EmbeddingsProvider | null,
  texts: string[],
  inputType: EmbeddingsInputType = "document",
): Promise<EmbeddingsResult> {
  if (texts.length === 0) {
    return Promise.resolve({ kind: "ok", vectors: [], usage: { totalTokens: 0 }, costUsd: 0, latencyMs: 0 });
  }
  if (provider == null) return Promise.resolve(embeddingsKeyAbsent());
  return provider.embed(texts, inputType);
}
