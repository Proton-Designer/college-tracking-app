// Weekly synthesis orchestration -- same ordering guarantee as runNightlyAnalysis.ts:
// the deterministic WeeklySynthesisPayload is built from the week's stored
// daily_summaries and persisted to weekly_summaries FIRST, unconditionally. Model
// enrichment is attempted only after that succeeds, and any failure in the model path
// degrades to the already-stored deterministic synthesis plus an honest note.

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;

import { addDays, type LocalDate } from "../core/index.ts";
import type { LlmModel, LlmProvider } from "../llm/types.ts";
import { callLlm, type GatewayDeps } from "../llm/gateway.ts";
import { getMonthlySpendUsd, logUsage } from "../llm/budget.ts";
import { buildWeeklySynthesis, loadRecentDailySummaries, storeWeeklySynthesis, type WeeklySynthesisPayload } from "./summaryPyramid.ts";
import { buildWeeklySynthesisRequest } from "./buildWeeklyContext.ts";
import { loadDurableProfile } from "./buildContext.ts";
import type { WeeklyAnalysis } from "./weeklyAnalysisSchema.ts";

export interface WeeklySynthesisDeps {
  client: AnySupabaseClient;
  provider: LlmProvider | null;
  model: LlmModel;
  maxTokens: number;
  now: () => Date;
}

export interface WeeklyAgentReportPayload {
  deterministic: WeeklySynthesisPayload;
  analysis: WeeklyAnalysis | null;
  note: string | null;
}

export interface WeeklySynthesisOutcome {
  userId: string;
  weekStartDate: LocalDate;
  reportId: number;
  model: string;
  usedModel: boolean;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

async function storeWeeklyAgentReport(
  client: AnySupabaseClient,
  userId: string,
  weekStartDate: LocalDate,
  payload: WeeklyAgentReportPayload,
  model: string,
): Promise<number> {
  const { data: existing, error: findError } = await client
    .from("agent_reports")
    .select("id")
    .eq("user_id", userId)
    .eq("report_type", "weekly")
    .eq("local_date", weekStartDate)
    .maybeSingle();
  if (findError) throw findError;

  if (existing) {
    const { error } = await client.from("agent_reports").update({ payload, model }).eq("id", existing.id);
    if (error) throw error;
    return existing.id;
  }

  const { data, error } = await client
    .from("agent_reports")
    .insert({ user_id: userId, local_date: weekStartDate, report_type: "weekly", payload, model })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** `weekEndDate` is the last day of the week being synthesized (inclusive) -- the
 *  caller's "today" for a Sunday-night weekly run, for example. The week itself is the
 *  7 days ending on it. */
export async function runWeeklySynthesisForUser(
  deps: WeeklySynthesisDeps,
  userId: string,
  weekEndDate: LocalDate,
): Promise<WeeklySynthesisOutcome> {
  const weekStartDate = addDays(weekEndDate, -6);
  const dailySummaries = await loadRecentDailySummaries(deps.client, userId, weekEndDate, 7);
  const weeklySynthesis = buildWeeklySynthesis(weekStartDate, dailySummaries);
  await storeWeeklySynthesis(deps.client, userId, weekStartDate, weeklySynthesis);

  if (!deps.provider) {
    const reportId = await storeWeeklyAgentReport(
      deps.client,
      userId,
      weekStartDate,
      { deterministic: weeklySynthesis, analysis: null, note: "No ANTHROPIC_API_KEY configured -- deterministic synthesis only." },
      "deterministic",
    );
    return { userId, weekStartDate, reportId, model: "deterministic", usedModel: false };
  }

  try {
    const { data: profile, error: profileError } = await deps.client
      .from("profiles")
      .select("llm_monthly_budget_usd")
      .eq("id", userId)
      .single();
    if (profileError) throw profileError;

    const durableProfile = await loadDurableProfile(deps.client, userId);
    const estimatedInputTokens = estimateTokens(JSON.stringify({ durableProfile, weeklySynthesis }));

    const request = buildWeeklySynthesisRequest({
      userId,
      model: deps.model,
      budgetCeilingUsd: profile.llm_monthly_budget_usd,
      maxTokens: deps.maxTokens,
      estimatedInputTokens,
      durableProfile,
      weeklySynthesis,
    });

    const gatewayDeps: GatewayDeps = {
      provider: deps.provider,
      getMonthlySpendUsd: (uid) => getMonthlySpendUsd(deps.client, uid, deps.now()),
      logUsage: (entry) => logUsage(deps.client, entry),
      now: deps.now,
    };

    const result = await callLlm(gatewayDeps, request);

    if (result.kind === "ok") {
      const reportId = await storeWeeklyAgentReport(
        deps.client,
        userId,
        weekStartDate,
        { deterministic: weeklySynthesis, analysis: result.data, note: null },
        deps.model,
      );
      return { userId, weekStartDate, reportId, model: deps.model, usedModel: true };
    }

    const note =
      result.kind === "budgetExceeded"
        ? `Monthly LLM budget would be exceeded ($${result.projectedSpendUsd.toFixed(2)} projected against a $${result.ceilingUsd.toFixed(2)} ceiling) -- deterministic synthesis only.`
        : `Model analysis unavailable (${result.reason}) -- deterministic synthesis only.`;
    const reportId = await storeWeeklyAgentReport(
      deps.client,
      userId,
      weekStartDate,
      { deterministic: weeklySynthesis, analysis: null, note },
      "deterministic",
    );
    return { userId, weekStartDate, reportId, model: "deterministic", usedModel: false };
  } catch (err) {
    const reportId = await storeWeeklyAgentReport(
      deps.client,
      userId,
      weekStartDate,
      {
        deterministic: weeklySynthesis,
        analysis: null,
        note: `Model analysis failed unexpectedly (${err instanceof Error ? err.message : String(err)}) -- deterministic synthesis only.`,
      },
      "deterministic",
    );
    return { userId, weekStartDate, reportId, model: "deterministic", usedModel: false };
  }
}
