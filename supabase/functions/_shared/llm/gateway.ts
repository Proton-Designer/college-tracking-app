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
/**
 * Logs one usage entry, converting a logging failure into a value instead of a throw.
 *
 * Added after the first real user-JWT gateway call (2026-08-25): llm_usage_log briefly
 * had no INSERT policy, logUsage threw on the RLS denial, and the throw escaped callLlm
 * as an opaque 500 -- AFTER the provider call had succeeded and been billed. The policy
 * is fixed (migration 40), but the gateway must never again turn a logging failure into
 * an unhandled crash. It also must not IGNORE one: this log is the budget ledger
 * getMonthlySpendUsd sums, so silently continuing on log failure would mean unlogged
 * spend and a ceiling that quietly stops enforcing. Fail closed, with a nameable reason.
 */
async function tryLog(deps: GatewayDeps, entry: Parameters<GatewayDeps["logUsage"]>[0]): Promise<string | null> {
  try {
    await deps.logUsage(entry);
    return null;
  } catch (err) {
    return `usage_logging_failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

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
      const logError = await logFailure(deps, request, now, null);
      // A ledger that can't record failures can't be trusted to record spend either --
      // stop retrying rather than keep calling a paid API off the books.
      if (logError != null) return { kind: "deterministicFallback", reason: logError };
      continue;
    }

    const parsed = request.schema.safeParse(providerResult.toolInput);
    if (parsed.success) {
      const costUsd = computeCostUsd(request.model, providerResult.usage, now);
      const logError = await tryLog(deps, {
        userId: request.userId,
        callType: request.callType,
        // Every callLlm path is Anthropic by construction -- this gateway has no other
        // provider. Voyage rows are written by the embeddings path, which does not (and
        // must not) pass through the forced-tool-call contract this function encodes.
        provider: "anthropic",
        model: request.model,
        usage: providerResult.usage,
        costUsd,
        latencyMs: providerResult.latencyMs,
        success: true,
        contentHash: await hashContent(JSON.stringify(providerResult.toolInput)),
      });
      // Fail CLOSED on an unlogged success: returning ok here would hand out results
      // whose cost the budget ledger never saw. The model's work is discarded -- the
      // honest price of keeping the ceiling enforceable.
      if (logError != null) return { kind: "deterministicFallback", reason: logError };
      return { kind: "ok", data: parsed.data, usage: providerResult.usage, costUsd };
    }

    lastFailureReason = `schema_validation_failed: ${parsed.error.issues.map((i) => i.path.join(".")).join(",")}`;
    const schemaLogError = await tryLog(deps, {
      userId: request.userId,
      callType: request.callType,
      provider: "anthropic",
      model: request.model,
      usage: providerResult.usage,
      costUsd: computeCostUsd(request.model, providerResult.usage, now),
      latencyMs: providerResult.latencyMs,
      success: false,
      contentHash: await hashContent(JSON.stringify(providerResult.toolInput)),
    });
    if (schemaLogError != null) return { kind: "deterministicFallback", reason: schemaLogError };
  }

  return { kind: "deterministicFallback", reason: lastFailureReason };
}

async function logFailure<T>(
  deps: GatewayDeps,
  request: CallLlmRequest<T>,
  now: Date,
  usage: LlmUsage | null,
): Promise<string | null> {
  return tryLog(deps, {
    userId: request.userId,
    callType: request.callType,
    provider: "anthropic",
    model: request.model,
    usage: usage ?? { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    costUsd: 0,
    latencyMs: null,
    success: false,
    contentHash: null,
  });
}

export type { LlmCallType, LlmModel };
