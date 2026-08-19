// Pricing table — docs/LLM_LAYER_SPEC.md §6, "as of 2026-08-11 per the brief; verify at
// implementation". Sonnet 5 has a dated rate change (introductory pricing through
// 2026-08-31), so cost is a function of the model AND `now` — never a bare constant.
// `now` is always an injected parameter, matching packages/core's "no ambient clock"
// convention even though this file lives outside packages/core.

import type { LlmModel, LlmUsage } from "./types.ts";

interface PriceTier {
  effectiveFrom: Date;
  inputPerMillion: number;
  outputPerMillion: number;
  cacheReadPerMillion: number;
}

const SONNET_RATE_CHANGE = new Date("2026-09-01T00:00:00Z");

const PRICE_TIERS: Record<LlmModel, PriceTier[]> = {
  "claude-haiku-4-5": [
    { effectiveFrom: new Date(0), inputPerMillion: 1, outputPerMillion: 5, cacheReadPerMillion: 0.1 },
  ],
  "claude-sonnet-5": [
    { effectiveFrom: new Date(0), inputPerMillion: 2, outputPerMillion: 10, cacheReadPerMillion: 0.3 },
    { effectiveFrom: SONNET_RATE_CHANGE, inputPerMillion: 3, outputPerMillion: 15, cacheReadPerMillion: 0.3 },
  ],
  "claude-opus-5": [
    // No published cache rate for Opus in the spec -- fall back to the plain input rate
    // rather than fabricating a discount. Documented approximation; revisit if Opus
    // caching becomes a real cost driver (it's the "rare" tier per the call inventory).
    { effectiveFrom: new Date(0), inputPerMillion: 5, outputPerMillion: 25, cacheReadPerMillion: 5 },
  ],
};

function tierFor(model: LlmModel, now: Date): PriceTier {
  const tiers = PRICE_TIERS[model];
  // Tiers are in ascending effectiveFrom order; the active tier is the LAST one whose
  // effectiveFrom is <= now.
  let active = tiers[0]!;
  for (const tier of tiers) {
    if (tier.effectiveFrom.getTime() <= now.getTime()) active = tier;
  }
  return active;
}

/** Cost in USD for one call's token usage, at the pricing in effect at `now`. */
export function computeCostUsd(model: LlmModel, usage: LlmUsage, now: Date): number {
  const tier = tierFor(model, now);
  const cost =
    (usage.inputTokens / 1_000_000) * tier.inputPerMillion +
    (usage.outputTokens / 1_000_000) * tier.outputPerMillion +
    (usage.cacheReadTokens / 1_000_000) * tier.cacheReadPerMillion +
    // Cache writes are billed at the plain input rate -- the spec doesn't publish a
    // separate write premium, so this is the conservative (not-underestimating) choice.
    (usage.cacheWriteTokens / 1_000_000) * tier.inputPerMillion;
  return Math.round(cost * 1e6) / 1e6;
}

/** Conservative pre-flight cost estimate before a real call, for the budget gate. */
export function estimateCostUsd(model: LlmModel, estimatedInputTokens: number, maxOutputTokens: number, now: Date): number {
  return computeCostUsd(
    model,
    { inputTokens: estimatedInputTokens, outputTokens: maxOutputTokens, cacheReadTokens: 0, cacheWriteTokens: 0 },
    now,
  );
}
