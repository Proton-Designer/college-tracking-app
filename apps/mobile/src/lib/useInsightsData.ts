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
import { useCallback, useEffect, useState } from "react";
import { getMobileSupabaseClient } from "./supabase/client";
import { useAuthSession } from "./useAuthSession";

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
   *  readings yet. The UI must say which -- never render a missing verdict as a neutral
   *  or zero result. Mirrors web's ActiveExperiment. */
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
  /** U7 -- newest first. Unscored ones are the "close the loop" queue. Mirrors web. */
  decisions: DecisionJournalRow[];
  planningExecution: PlanningExecutionResult | null;
}

export type InsightsFetchState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: InsightsData };

function groupByTier(insights: Insight[]): InsightsByTier {
  const byTier: InsightsByTier = { high: [], medium: [], testing: [] };
  for (const insight of insights) {
    byTier[insight.confidence_stored].push(insight);
  }
  return byTier;
}

/** Mirrors apps/web/src/app/(app)/insights/data.ts's loadInsightsData exactly -- same
 *  sources, same 30-day windows, same yesterday-scoped planning/execution diagnosis. */
export function useInsightsData() {
  const { session, loading: authLoading } = useAuthSession();
  const userId = session?.user.id;
  const [fetchState, setFetchState] = useState<InsightsFetchState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (authLoading || !userId) return;
    let cancelled = false;
    const client = getMobileSupabaseClient();

    getOwnProfile(client).then((profileResult) => {
      if (cancelled) return;
      if (!profileResult.ok) {
        setFetchState({ status: "error", error: profileResult.error.message });
        return;
      }
      const profile = profileResult.data;
      const now = new Date();
      const today = getUserLocalToday(profile.timezone, now);
      const currentWindow = { since: addDays(today, -(WINDOW_DAYS - 1)), until: today };
      const previousWindow = { since: addDays(today, -(2 * WINDOW_DAYS - 1)), until: addDays(today, -WINDOW_DAYS) };

      Promise.all([
        listActiveInsights(client),
        listExperiments(client, "running"),
        listKillHabits(client, userId),
        computeUserFrictionDistribution(client, userId, currentWindow.since, currentWindow.until),
        computeUserFrictionTrend(client, userId, previousWindow, currentWindow),
        computeYesterdayPlanningExecution(client, userId, today),
        listCalibrationTable(client, userId, profile.timezone, now),
        listDecisions(client, { limit: 20 }),
      ]).then(([insightsResult, runningExperimentsResult, killHabitsResult, frictionDistributionResult, frictionTrendResult, planningExecution, calibrationTable, decisionsResult]) => {
        if (cancelled) return;
        if (!insightsResult.ok) {
          setFetchState({ status: "error", error: insightsResult.error.message });
          return;
        }
        if (!runningExperimentsResult.ok) {
          setFetchState({ status: "error", error: runningExperimentsResult.error.message });
          return;
        }
        if (!killHabitsResult.ok) {
          setFetchState({ status: "error", error: killHabitsResult.error.message });
          return;
        }
        if (!frictionDistributionResult.ok) {
          setFetchState({ status: "error", error: frictionDistributionResult.error.message });
          return;
        }
        if (!frictionTrendResult.ok) {
          setFetchState({ status: "error", error: frictionTrendResult.error.message });
          return;
        }

        Promise.all(
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
        ).then((activeExperiments) => {
          if (cancelled) return;

          Promise.all(
            killHabitsResult.data.map(async (habit) => {
              const result = await computeHabitBounceBack(client, userId, habit.id, today);
              return result.ok ? { habit, result: result.data } : null;
            }),
          ).then((bounceBackResults) => {
            if (cancelled) return;
            const bounceBackByHabit = bounceBackResults.filter((entry): entry is HabitBounceBack => entry != null);

            setFetchState({
              status: "ready",
              data: {
                today,
                insightsByTier: groupByTier(insightsResult.data),
                activeExperiments,
                calibrationTable,
                frictionDistribution: frictionDistributionResult.data,
                frictionTrend: frictionTrendResult.data,
                bounceBackByHabit,
                decisions: decisionsResult.ok ? decisionsResult.data : [],
                planningExecution,
              },
            });
          });
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, userId, reloadToken]);

  if (authLoading) return { status: "loading" as const, refetch };
  if (!userId) return { status: "error" as const, error: "Not signed in.", refetch };
  return { ...fetchState, refetch };
}
