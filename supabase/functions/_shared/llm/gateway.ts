// The one gateway every Anthropic call in CollegeOS goes through — docs/LLM_LAYER_SPEC.md
// §6. No call site is permitted to talk to a provider directly; that's what makes the
// budget gate and schema validation unbypassable rather than a convention someone can
// forget.

import type { z } from "zod";
import type { LlmCallType, LlmModel, LlmProvider, LlmToolCallRequest, LlmUsage, UsageLogEntry } from "./types.ts";
import { computeCostUsd, estimateCostUsd } from "./costs.ts";
import { hashContent } from "./hash.ts";

export interface BudgetExceeded {
  kind: "budgetExceeded";
  projectedSpendUsd: number;
  ceilingUsd: number;
}

export interface DeterministicFallback {
  kind: "deterministicFallback";
  /** Never the raw provider error text verbatim to a log sink that might retain it long
   *  term with other context -- a short, safe reason string. */
  reason: string;
}

export interface GatewaySuccess<T> {
  kind: "ok";
  data: T;
  usage: LlmUsage;
  costUsd: number;
}

export type GatewayResult<T> = GatewaySuccess<T> | BudgetExceeded | DeterministicFallback;

export interface GatewayDeps {
  provider: LlmProvider;
  /** Sum of this user's llm_usage_log.cost_usd for the current calendar month. */
  getMonthlySpendUsd: (userId: string) => Promise<number>;
  logUsage: (entry: UsageLogEntry) => Promise<void>;
  now: () => Date;
}

export interface CallLlmRequest<T> extends LlmToolCallRequest {
  userId: string;
  budgetCeilingUsd: number;
  schema: z.ZodType<T>;
  /** Rough pre-flight input-token estimate for the budget check, before the real call
   *  reports actual usage. Deliberately conservative (an overestimate is safe; an
   *  underestimate could let a call through that blows the ceiling). */
  estimatedInputTokens: number;
}

const MAX_ATTEMPTS = 2; // one real attempt + one retry, per the spec's failure ladder

/**
 * Pre-flight budget check -> call -> Zod validation -> retry once on validation failure
 * -> deterministic fallback on second failure. Every outcome is logged (success or not),
 * and the log never contains the prompt or response body -- only a hash.
 */
export async function callLlm<T>(deps: GatewayDeps, request: CallLlmRequest<T>): Promise<GatewayResult<T>> {
  const now = deps.now();

  const spentUsd = await deps.getMonthlySpendUsd(request.userId);
  const estimatedCostUsd = estimateCostUsd(request.model, request.estimatedInputTokens, request.maxTokens, now);
  const projectedSpendUsd = spentUsd + estimatedCostUsd;
  if (projectedSpendUsd > request.budgetCeilingUsd) {
    // Deterministic-first gate: no HTTP call is made once the ceiling would be crossed.
    return { kind: "budgetExceeded", projectedSpendUsd, ceilingUsd: request.budgetCeilingUsd };
  }

  let lastFailureReason = "unknown";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let providerResult;
    try {
      providerResult = await deps.provider.call(request);
    } catch (err) {
      lastFailureReason = `provider_error: ${err instanceof Error ? err.message : String(err)}`;
      await logFailure(deps, request, now, null);
      continue;
    }

    const parsed = request.schema.safeParse(providerResult.toolInput);
    if (parsed.success) {
      const costUsd = computeCostUsd(request.model, providerResult.usage, now);
      await deps.logUsage({
        userId: request.userId,
        callType: request.callType,
        model: request.model,
        usage: providerResult.usage,
        costUsd,
        latencyMs: providerResult.latencyMs,
        success: true,
        contentHash: await hashContent(JSON.stringify(providerResult.toolInput)),
      });
      return { kind: "ok", data: parsed.data, usage: providerResult.usage, costUsd };
    }

    lastFailureReason = `schema_validation_failed: ${parsed.error.issues.map((i) => i.path.join(".")).join(",")}`;
    await deps.logUsage({
      userId: request.userId,
      callType: request.callType,
      model: request.model,
      usage: providerResult.usage,
      costUsd: computeCostUsd(request.model, providerResult.usage, now),
      latencyMs: providerResult.latencyMs,
      success: false,
      contentHash: await hashContent(JSON.stringify(providerResult.toolInput)),
    });
  }

  return { kind: "deterministicFallback", reason: lastFailureReason };
}

async function logFailure<T>(
  deps: GatewayDeps,
  request: CallLlmRequest<T>,
  now: Date,
  usage: LlmUsage | null,
): Promise<void> {
  await deps.logUsage({
    userId: request.userId,
    callType: request.callType,
    model: request.model,
    usage: usage ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0,
    latencyMs: null,
    success: false,
    contentHash: null,
  });
}

export type { LlmCallType, LlmModel };
