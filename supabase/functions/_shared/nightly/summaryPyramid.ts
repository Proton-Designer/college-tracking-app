// LLM_LAYER_SPEC.md §5's summary pyramid: raw events -> daily summary -> 7-day rolling ->
// 30-day pattern -> semester durable lessons. This file builds the two tiers L7 actually
// asks for tonight (daily, weekly) -- monthly/semester stay schema-ready from L1,
// unbuilt, matching how L6 found most of its schema already waiting for a write path.
//
// Deliberately compact: this is what gets SENT as context to a future model call (the
// "last 7 daily summaries", never raw history), so it stays small on purpose -- the full
// detail lives in the deterministic nightly report (agent_reports), not here.

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;

import { addDays, type LocalDate } from "../core/index.ts";
import type { DeterministicNightlyReport } from "./assembleReport.ts";

export interface DailySummaryPayload {
  mitsPlanned: number | null;
  mitsCompleted: number | null;
  deepWorkPlannedMin: number | null;
  deepWorkActualMin: number | null;
  recoveryModeTriggered: boolean;
  planningExecutionDiagnosis: string | null;
  startDelayMin: number | null;
  topRiskCourseId: number | null;
  topRiskScore: number | null;
  frictionCauses: string[];
  killListRelapses: number;
  killListResisted: number;
  focusSessionsCompleted: number;
  focusSessionsAbandoned: number;
  focusMinutesActual: number;
  /** Whichever of proud_text/went_wrong_text the review carries -- one line, not both, to
   *  keep this tier genuinely small. Prefers went_wrong_text: a rollup optimized for
   *  behavior change should default to surfacing the failure, not the win, when only one
   *  fits -- matching the brief's "goal is behavior change, not reassurance." */
  notableEvent: string | null;
  dataGapCount: number;
}

/** Pure -- derives the compact rollup from the already-assembled full report. */
export function buildDailySummary(report: DeterministicNightlyReport): DailySummaryPayload {
  const topCourseRisk = [...report.riskAssessment.courseRisks].sort((a, b) => b.result.score - a.result.score)[0];

  return {
    mitsPlanned: report.review?.mitsPlanned ?? null,
    mitsCompleted: report.review?.mitsCompleted ?? null,
    deepWorkPlannedMin: report.review?.deepWorkPlannedMin ?? null,
    deepWorkActualMin: report.review?.deepWorkActualMin ?? null,
    recoveryModeTriggered: report.recoveryMode.triggered,
    planningExecutionDiagnosis: report.planningExecution?.diagnosis ?? null,
    startDelayMin: report.planningExecution?.startDelayMin ?? null,
    topRiskCourseId: topCourseRisk?.courseId ?? null,
    topRiskScore: topCourseRisk?.result.score ?? null,
    frictionCauses: report.frictionToday.entries.map((e) => e.cause),
    killListRelapses: report.killLoop.reduce((sum, h) => sum + h.relapsesToday, 0),
    killListResisted: report.killLoop.reduce((sum, h) => sum + (h.eventsToday - h.relapsesToday), 0),
    focusSessionsCompleted: report.focusSessions.completedCount,
    focusSessionsAbandoned: report.focusSessions.abandonedCount,
    focusMinutesActual: report.focusSessions.totalActualMin,
    notableEvent: report.review?.wentWrongText ?? report.review?.proudText ?? null,
    dataGapCount: report.dataGaps.length,
  };
}

export async function storeDailySummary(
  client: AnySupabaseClient,
  userId: string,
  localDate: LocalDate,
  summary: DailySummaryPayload,
): Promise<void> {
  const { error } = await client
    .from("daily_summaries")
    .upsert({ user_id: userId, local_date: localDate, summary }, { onConflict: "user_id,local_date" });
  if (error) throw error;
}

export async function loadRecentDailySummaries(
  client: AnySupabaseClient,
  userId: string,
  throughDate: LocalDate,
  days: number,
): Promise<Array<{ localDate: LocalDate; summary: DailySummaryPayload }>> {
  const since = addDays(throughDate, -(days - 1));
  const { data, error } = await client
    .from("daily_summaries")
    .select("local_date, summary")
    .eq("user_id", userId)
    .gte("local_date", since)
    .lte("local_date", throughDate)
    .order("local_date");
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((row: any) => ({ localDate: row.local_date, summary: row.summary as DailySummaryPayload }));
}

// ============================================================================
// Weekly synthesis (deterministic) -- the brief's structure: OUTCOMES, PLAN ACCURACY,
// ACADEMICS, BEHAVIOR, HEALTH, KILL LIST, SYSTEM FAILURE, EXPERIMENT. Built from the
// week's 7 daily_summaries rows, not raw history -- the whole point of the pyramid.
// ============================================================================

export interface WeeklySynthesisPayload {
  weekStartDate: LocalDate;
  weekEndDate: LocalDate;
  daysWithData: number;

  outcomes: {
    totalMitsPlanned: number;
    totalMitsCompleted: number;
    totalDeepWorkActualMin: number;
    recoveryModeDays: number;
  };

  planAccuracy: {
    /** Count of each diagnosis across the week -- e.g. {overplanning: 2, calibrated: 4}. */
    diagnosisCounts: Record<string, number>;
    averageStartDelayMin: number | null;
  };

  academics: {
    /** Highest risk score seen for each course across the week, worst-day snapshot. */
    peakRiskByCourse: Array<{ courseId: number; peakScore: number }>;
  };

  behavior: {
    /** Friction causes across the week, most frequent first. */
    frictionCauseCounts: Record<string, number>;
  };

  killList: {
    totalRelapses: number;
    totalResisted: number;
  };

  /**
   * Deterministic-only signal for the brief's SYSTEM FAILURE section -- genuinely
   * mostly a model judgment (see LLM_LAYER_SPEC.md's own framing), but code CAN flag
   * one honest, checkable fact: how many of the last 7 nights had enough real data to
   * even produce a report. A week where CollegeOS itself has nothing to work with is
   * itself a system-failure candidate, not a user-failure one.
   */
  systemFailureSignals: {
    daysWithNoReview: number;
    daysWithDataGaps: number;
  };

  /** Deliberately null -- selecting a genuinely new experiment for next week is exactly
   *  the kind of judgment call §0's "the model never chooses what matters" rule was
   *  written for. This field exists so the shape matches what a real synthesis (model or
   *  human-authored) will fill in, without this deterministic pass inventing one. */
  experiment: null;
}

export function buildWeeklySynthesis(
  weekStartDate: LocalDate,
  dailySummaries: Array<{ localDate: LocalDate; summary: DailySummaryPayload }>,
): WeeklySynthesisPayload {
  const weekEndDate = dailySummaries.length > 0 ? dailySummaries[dailySummaries.length - 1]!.localDate : weekStartDate;

  const diagnosisCounts: Record<string, number> = {};
  const frictionCauseCounts: Record<string, number> = {};
  const peakScoreByCourse = new Map<number, number>();
  const startDelays: number[] = [];
  let daysWithNoReview = 0;
  let daysWithDataGaps = 0;

  let totalMitsPlanned = 0;
  let totalMitsCompleted = 0;
  let totalDeepWorkActualMin = 0;
  let recoveryModeDays = 0;
  let totalRelapses = 0;
  let totalResisted = 0;

  for (const { summary } of dailySummaries) {
    totalMitsPlanned += summary.mitsPlanned ?? 0;
    totalMitsCompleted += summary.mitsCompleted ?? 0;
    totalDeepWorkActualMin += summary.deepWorkActualMin ?? 0;
    if (summary.recoveryModeTriggered) recoveryModeDays += 1;
    if (summary.planningExecutionDiagnosis) {
      diagnosisCounts[summary.planningExecutionDiagnosis] = (diagnosisCounts[summary.planningExecutionDiagnosis] ?? 0) + 1;
    }
    if (summary.startDelayMin != null) startDelays.push(summary.startDelayMin);
    if (summary.topRiskCourseId != null && summary.topRiskScore != null) {
      const current = peakScoreByCourse.get(summary.topRiskCourseId) ?? -Infinity;
      if (summary.topRiskScore > current) peakScoreByCourse.set(summary.topRiskCourseId, summary.topRiskScore);
    }
    for (const cause of summary.frictionCauses) {
      frictionCauseCounts[cause] = (frictionCauseCounts[cause] ?? 0) + 1;
    }
    totalRelapses += summary.killListRelapses;
    totalResisted += summary.killListResisted;
    if (summary.mitsPlanned == null) daysWithNoReview += 1;
    if (summary.dataGapCount > 0) daysWithDataGaps += 1;
  }

  return {
    weekStartDate,
    weekEndDate,
    daysWithData: dailySummaries.length,
    outcomes: { totalMitsPlanned, totalMitsCompleted, totalDeepWorkActualMin, recoveryModeDays },
    planAccuracy: {
      diagnosisCounts,
      averageStartDelayMin: startDelays.length > 0 ? startDelays.reduce((a, b) => a + b, 0) / startDelays.length : null,
    },
    academics: {
      peakRiskByCourse: [...peakScoreByCourse.entries()]
        .map(([courseId, peakScore]) => ({ courseId, peakScore }))
        .sort((a, b) => b.peakScore - a.peakScore),
    },
    behavior: { frictionCauseCounts },
    killList: { totalRelapses, totalResisted },
    systemFailureSignals: { daysWithNoReview, daysWithDataGaps },
    experiment: null,
  };
}

export async function storeWeeklySynthesis(
  client: AnySupabaseClient,
  userId: string,
  weekStartDate: LocalDate,
  summary: WeeklySynthesisPayload,
): Promise<void> {
  const { error } = await client
    .from("weekly_summaries")
    .upsert({ user_id: userId, week_start_date: weekStartDate, summary }, { onConflict: "user_id,week_start_date" });
  if (error) throw error;
}
