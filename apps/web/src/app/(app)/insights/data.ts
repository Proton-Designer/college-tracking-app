import "server-only";
import {
  computeHabitBounceBack,
  computeUserFrictionDistribution,
  computeUserFrictionTrend,
  computeYesterdayPlanningExecution,
  getOwnProfile,
  getUserLocalToday,
  listActiveInsights,
  listCalibrationTable,
  listDecisions,
  getExperimentOutcome,
  listExperimentMeasurements,
  listExperiments,
  listKillHabits,
  type CalibrationTableRow,
  type DecisionJournalRow,
  type Experiment,
  type ExperimentMeasurementRow,
  type Insight,
  type KillHabitRow,
} from "@collegeos/api";
import { addDays, type BounceBackResult, type ExperimentOutcome, type CauseTrendEntry, type FrictionDistribution, type PlanningExecutionResult } from "@collegeos/core";
import { getServerSupabaseClient } from "@/lib/supabase/server";

const WINDOW_DAYS = 30;

export interface InsightsByTier {
  high: Insight[];
  medium: Insight[];
  testing: Insight[];
}

export interface ActiveExperiment {
  experiment: Experiment;
  measurements: ExperimentMeasurementRow[];
  /** The live deterministic verdict (U9). Null is a real, expected state, not an error:
   *  the trial declared no baseline/direction/metric, or hasn't accumulated enough
   *  readings yet. The UI must say which — never render a missing verdict as a neutral
   *  or zero result. */
  outcome: ExperimentOutcome | null;
}

export interface HabitBounceBack {
  habit: KillHabitRow;
  result: BounceBackResult;
}

export interface InsightsData {
  today: string;
  insightsByTier: InsightsByTier;
  activeExperiments: ActiveExperiment[];
  calibrationTable: CalibrationTableRow[];
  frictionDistribution: FrictionDistribution;
  frictionTrend: CauseTrendEntry[];
  bounceBackByHabit: HabitBounceBack[];
  /** U7 — newest first. Unscored ones are the "close the loop" queue. */
  decisions: DecisionJournalRow[];
  planningExecution: PlanningExecutionResult | null;
}

export type InsightsLoadResult = { ok: true; data: InsightsData } | { ok: false; error: string };

function groupByTier(insights: Insight[]): InsightsByTier {
  const byTier: InsightsByTier = { high: [], medium: [], testing: [] };
  for (const insight of insights) {
    byTier[insight.confidence_stored].push(insight);
  }
  return byTier;
}

export async function loadInsightsData(): Promise<InsightsLoadResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const profile = profileResult.data;
  const now = new Date();
  const today = getUserLocalToday(profile.timezone, now);

  const currentWindow = { since: addDays(today, -(WINDOW_DAYS - 1)), until: today };
  const previousWindow = { since: addDays(today, -(2 * WINDOW_DAYS - 1)), until: addDays(today, -WINDOW_DAYS) };

  const [
    insightsResult,
    runningExperimentsResult,
    killHabitsResult,
    frictionDistributionResult,
    frictionTrendResult,
    planningExecution,
    calibrationTable,
    decisionsResult,
  ] = await Promise.all([
    listActiveInsights(client),
    listExperiments(client, "running"),
    listKillHabits(client, user.id),
    computeUserFrictionDistribution(client, user.id, currentWindow.since, currentWindow.until),
    computeUserFrictionTrend(client, user.id, previousWindow, currentWindow),
    computeYesterdayPlanningExecution(client, user.id, today),
    listCalibrationTable(client, user.id, profile.timezone, now),
    listDecisions(client, { limit: 20 }),
  ]);

  if (!insightsResult.ok) return { ok: false, error: insightsResult.error.message };
  if (!runningExperimentsResult.ok) return { ok: false, error: runningExperimentsResult.error.message };
  if (!killHabitsResult.ok) return { ok: false, error: killHabitsResult.error.message };
  if (!frictionDistributionResult.ok) return { ok: false, error: frictionDistributionResult.error.message };
  if (!frictionTrendResult.ok) return { ok: false, error: frictionTrendResult.error.message };

  const activeExperiments: ActiveExperiment[] = await Promise.all(
    runningExperimentsResult.data.map(async (experiment) => {
      const [measurementsResult, outcomeResult] = await Promise.all([
        listExperimentMeasurements(client, experiment.id),
        getExperimentOutcome(client, experiment.id),
      ]);
      return {
        experiment,
        measurements: measurementsResult.ok ? measurementsResult.data : [],
        outcome: outcomeResult.ok ? outcomeResult.data : null,
      };
    }),
  );

  const bounceBackByHabit: HabitBounceBack[] = (
    await Promise.all(
      killHabitsResult.data.map(async (habit) => {
        const result = await computeHabitBounceBack(client, user.id, habit.id, today, profile.timezone);
        return result.ok ? { habit, result: result.data } : null;
      }),
    )
  ).filter((entry): entry is HabitBounceBack => entry != null);

  return {
    ok: true,
    data: {
      today,
      insightsByTier: groupByTier(insightsResult.data),
      activeExperiments,
      calibrationTable,
      frictionDistribution: frictionDistributionResult.data,
      frictionTrend: frictionTrendResult.data,
      bounceBackByHabit,
      planningExecution,
      decisions: decisionsResult.ok ? decisionsResult.data : [],
    },
  };
}
