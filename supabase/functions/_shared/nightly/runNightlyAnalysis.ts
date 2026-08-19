// The core nightly-analysis orchestration, factored out of the HTTP handler so it's
// directly unit-testable with a fixture provider (no live server, no live database
// needed for the golden-fixture tests -- only for the real end-to-end itest).
//
// The order of operations is the whole point of this file: the deterministic report and
// daily summary are assembled and stored FIRST, unconditionally. The model call is
// attempted only after that succeeds, and ANY failure in the model path -- budget
// breach, schema validation failure, or a genuinely unexpected error -- degrades to the
// already-stored deterministic report plus an honest note. There is no code path that
// produces an empty or broken agent_reports row.

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;

import type { LocalDate } from "../core/index.ts";
import type { LlmModel, LlmProvider } from "../llm/types.ts";
import { callLlm, type GatewayDeps } from "../llm/gateway.ts";
import { getMonthlySpendUsd, logUsage } from "../llm/budget.ts";
import { assembleDeterministicNightlyReport, type DeterministicNightlyReport } from "./assembleReport.ts";
import { buildDailySummary, loadRecentDailySummaries, storeDailySummary } from "./summaryPyramid.ts";
import { buildNightlyAnalysisRequest, loadDurableProfile, loadHorizon } from "./buildContext.ts";
import type { DailyAnalysis } from "./dailyAnalysisSchema.ts";

export interface NightlyAnalysisDeps {
  client: AnySupabaseClient;
  /** Absent entirely when no ANTHROPIC_API_KEY exists -- the real state of this
   *  environment tonight. The deterministic path runs unconditionally either way. */
  provider: LlmProvider | null;
  model: LlmModel;
  maxTokens: number;
  now: () => Date;
}

export interface NightlyAgentReportPayload {
  deterministic: DeterministicNightlyReport;
  analysis: DailyAnalysis | null;
  /** Present exactly when analysis is null -- why the model layer didn't produce a
   *  result. Never silently absent when analysis is missing. */
  note: string | null;
}

export interface NightlyAnalysisOutcome {
  userId: string;
  localDate: LocalDate;
  reportId: number;
  model: string;
  usedModel: boolean;
}

function estimateTokens(text: string): number {
  // No live tokenizer available offline -- a conservative chars/4 heuristic, consistent
  // with LLM_LAYER_SPEC.md §6's "an overestimate is safe; an underestimate is not."
  return Math.ceil(text.length / 3);
}

/**
 * Insert-or-update on (user_id, report_type, local_date) -- agent_reports has no unique
 * constraint on that triple (each report_type's history is meant to accumulate over
 * time), so a same-night re-run (a manual retrigger, a fixed bug re-run) replaces that
 * night's row instead of accumulating duplicates for the same local_date.
 */
async function storeNightlyAgentReport(
  client: AnySupabaseClient,
  userId: string,
  localDate: LocalDate,
  payload: NightlyAgentReportPayload,
  model: string,
): Promise<number> {
  const { data: existing, error: findError } = await client
    .from("agent_reports")
    .select("id")
    .eq("user_id", userId)
    .eq("report_type", "nightly")
    .eq("local_date", localDate)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const { error } = await client.from("agent_reports").update({ payload, model }).eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await client
    .from("agent_reports")
    .insert({ user_id: userId, local_date: localDate, report_type: "nightly", payload, model })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function runNightlyAnalysisForUser(
  deps: NightlyAnalysisDeps,
  userId: string,
  localDate: LocalDate,
): Promise<NightlyAnalysisOutcome> {
  const report = await assembleDeterministicNightlyReport(deps.client, userId, localDate);
  const dailySummary = buildDailySummary(report);
  await storeDailySummary(deps.client, userId, localDate, dailySummary);

  if (!deps.provider) {
    const reportId = await storeNightlyAgentReport(
      deps.client,
      userId,
      localDate,
      { deterministic: report, analysis: null, note: "No ANTHROPIC_API_KEY configured -- deterministic report only." },
      "deterministic",
    );
    return { userId, localDate, reportId, model: "deterministic", usedModel: false };
  }

  try {
    const { data: profile, error: profileError } = await deps.client
      .from("profiles")
      .select("llm_monthly_budget_usd")
      .eq("id", userId)
      .single();
    if (profileError) throw profileError;

    const [durableProfile, horizon, recentDailySummaries] = await Promise.all([
      loadDurableProfile(deps.client, userId),
      loadHorizon(deps.client, userId, localDate),
      loadRecentDailySummaries(deps.client, userId, localDate, 7),
    ]);

    const estimatedInputTokens = estimateTokens(
      JSON.stringify({ durableProfile, horizon, recentDailySummaries, report }),
    );

    const request = buildNightlyAnalysisRequest({
      userId,
      model: deps.model,
      budgetCeilingUsd: profile.llm_monthly_budget_usd,
      maxTokens: deps.maxTokens,
      estimatedInputTokens,
      durableProfile,
      recentDailySummaries,
      today: report,
      horizon,
    });

    const gatewayDeps: GatewayDeps = {
      provider: deps.provider,
      getMonthlySpendUsd: (uid) => getMonthlySpendUsd(deps.client, uid, deps.now()),
      logUsage: (entry) => logUsage(deps.client, entry),
      now: deps.now,
    };

    const result = await callLlm(gatewayDeps, request);

    if (result.kind === "ok") {
      const reportId = await storeNightlyAgentReport(
        deps.client,
        userId,
        localDate,
        { deterministic: report, analysis: result.data, note: null },
        deps.model,
      );
      return { userId, localDate, reportId, model: deps.model, usedModel: true };
    }

    const note =
      result.kind === "budgetExceeded"
        ? `Monthly LLM budget would be exceeded ($${result.projectedSpendUsd.toFixed(2)} projected against a $${result.ceilingUsd.toFixed(2)} ceiling) -- deterministic report only.`
        : `Model analysis unavailable (${result.reason}) -- deterministic report only.`;
    const reportId = await storeNightlyAgentReport(
      deps.client,
      userId,
      localDate,
      { deterministic: report, analysis: null, note },
      "deterministic",
    );
    return { userId, localDate, reportId, model: "deterministic", usedModel: false };
  } catch (err) {
    // Any unexpected failure in the model path (a durable-profile query error, a
    // network exception the gateway didn't itself catch) must still land on the
    // deterministic report -- never propagate past this point and leave the night with
    // no report at all.
    const reportId = await storeNightlyAgentReport(
      deps.client,
      userId,
      localDate,
      {
        deterministic: report,
        analysis: null,
        note: `Model analysis failed unexpectedly (${err instanceof Error ? err.message : String(err)}) -- deterministic report only.`,
      },
      "deterministic",
    );
    return { userId, localDate, reportId, model: "deterministic", usedModel: false };
  }
}
