// Voyage pricing, in the same shape as _shared/llm/costs.ts: a table, never a bare
// constant scattered through call sites, so a rate change is one edit.
//
// voyage-3.5-lite: $0.02 per 1M tokens (Voyage's published rate for the lite tier as of
// 2026-08; UNVERIFIED against a live invoice, because no VOYAGE_API_KEY exists here —
// verify at the same moment the key is supplied, alongside the LLM_LAYER_SPEC pricing
// check the Anthropic table already carries).
//
// No dated tier list here (unlike Sonnet's introductory-pricing change) because Voyage
// publishes no scheduled rate change; if one appears, copy the `PriceTier[]`/`tierFor`
// shape from _shared/llm/costs.ts rather than inventing a second mechanism.

import type { EmbeddingsModel } from "./types.ts";

const PRICE_PER_MILLION_TOKENS: Record<EmbeddingsModel, number> = {
  "voyage-3.5-lite": 0.02,
};

export function computeEmbeddingsCostUsd(model: EmbeddingsModel, totalTokens: number): number {
  const rate = PRICE_PER_MILLION_TOKENS[model];
  return Math.round((totalTokens / 1_000_000) * rate * 1e6) / 1e6;
}

/** The same crude `chars/4` estimate the syllabus path uses for its budget pre-flight.
 *  Deliberately an OVERestimate-friendly rule: an underestimate could let a batch
 *  through that crosses a ceiling. */
export function estimateEmbeddingsTokens(texts: string[]): number {
  return texts.reduce((sum, text) => sum + Math.ceil(text.length / 4), 0);
}
