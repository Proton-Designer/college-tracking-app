import { addDays, computePlanningExecutionGap, type Confidence, type LocalDate, type PlanningExecutionResult } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';

const HISTORICAL_CAPACITY_LOOKBACK_DAYS = 30;

/**
 * A brand-new user has zero `daily_reviews` history, and a median over zero values is 0
 * -- which fed straight into computeCapacityMinutes as `historicalDeepWorkP50Minutes`,
 * making EVERY day's capacity exactly zero. That made Today's Floor/Target/Stretch
 * meaningless, MIT selection have no budget to fill, and weekly planning place nothing
 * at all, for every user's very first days on the product, before they'd done anything
 * wrong or unusual -- found live via a weekly-planning itest against a genuinely fresh
 * throwaway user, the first thing in this codebase to actually exercise the cold path
 * (every other itest and the demo account run against seeded history).
 *
 * Same "prior, not a measurement" pattern as GLOBAL_MEAN_START_DELAY_DAYS_PRIOR
 * (day/risk.ts): a reasonable college day's deep work, used ONLY below the sample-size
 * threshold real history needs to be trusted, and confidence downgrades whenever it's
 * the one actually used -- never presented as if it were measured.
 */
// @barrel-internal -- same visibility reasoning as GLOBAL_MEAN_START_DELAY_DAYS_PRIOR: this
// is for a reader inside the engine to see the number is a prior, not for a UI to import
// and render as though it were an observed fact.
export const DEFAULT_HISTORICAL_DEEP_WORK_P50_MINUTES_PRIOR = 120;

/** Same confidence bands as calibration.ts's confidenceForEffectiveN (§3), reused rather
 *  than inventing a second threshold set for what is conceptually the same question:
 *  "how many real observations back this number." */
const MIN_SAMPLE_SIZE_HIGH_CONFIDENCE = 12;
const MIN_SAMPLE_SIZE_MODERATE_CONFIDENCE = 6;
const MIN_SAMPLE_SIZE_LOW_CONFIDENCE = 3;

function confidenceForSampleSize(sampleSize: number): Confidence {
  if (sampleSize >= MIN_SAMPLE_SIZE_HIGH_CONFIDENCE) return 'high';
  if (sampleSize >= MIN_SAMPLE_SIZE_MODERATE_CONFIDENCE) return 'moderate';
  if (sampleSize >= MIN_SAMPLE_SIZE_LOW_CONFIDENCE) return 'low';
  return 'insufficient';
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

function minutesSinceMidnightUTC(iso: string): number {
  const d = new Date(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** actualStartMin relative to plannedStartMin, computed from the real elapsed time between
 *  the two instants rather than by taking minutesSinceMidnightUTC of each and subtracting.
 *  The subtract-two-midnights approach wraps incorrectly whenever planned and actual straddle
 *  UTC midnight -- routine for an evening-timeboxed task in a US timezone (UTC midnight is
 *  ~7-8pm Eastern) -- turning a real 30-minute delay into a reported -1410 ("23.5h early").
 *  plannedStartMin keeps its literal minutes-since-midnight meaning; actualStartMin is only
 *  ever consumed as (actualStartMin - plannedStartMin), so anchoring it to the real elapsed
 *  minutes past plannedStartMin keeps that diff correct across the day boundary. */
function actualStartMinFrom(plannedStartMin: number, plannedIso: string, actualIso: string): number {
  const elapsedMin = (new Date(actualIso).getTime() - new Date(plannedIso).getTime()) / 60_000;
  return plannedStartMin + elapsedMin;
}

// @barrel-internal -- the return type of computeHistoricalCapacityP50Min, itself
// @barrel-internal; consumers (dayView.ts, planning/weeklyPlan.ts) destructure the fields
// they need rather than importing this type by name.
export interface HistoricalCapacityP50 {
  minutes: number;
  sampleSize: number;
  confidence: Confidence;
  /** True when `minutes` is DEFAULT_HISTORICAL_DEEP_WORK_P50_MINUTES_PRIOR rather than a
   *  real median -- the caller-facing "is this measured or estimated" flag. */
  usingPrior: boolean;
}

/**
 * Median actual deep-work minutes over the last 30 days of night reviews — the closest
 * real signal to packages/core's "historicalDeepWorkP50Minutes" without a dedicated
 * rolling-stats table. Shared by planning-vs-execution (yesterday), today's workload
 * capacity sizing, AND weekly planning, so all three agree on the same historical
 * baseline. Below MIN_SAMPLE_SIZE_LOW_CONFIDENCE real observations, falls back to the
 * documented prior rather than a real-but-meaningless median of a near-empty (or empty)
 * sample.
 */
// @barrel-internal -- feeds getDayView/computeCapacityHorizon/workload/weekly-planning internally;
// consumers get its output through those already-exported functions, not by calling this directly.
export async function computeHistoricalCapacityP50Min(
  client: TypedSupabaseClient,
  userId: string,
  today: LocalDate,
): Promise<HistoricalCapacityP50> {
  const lookbackStart = addDays(today, -HISTORICAL_CAPACITY_LOOKBACK_DAYS);
  const { data, error } = await client
    .from('daily_reviews')
    .select('deep_work_actual_min')
    .eq('user_id', userId)
    .gte('local_date', lookbackStart)
    .not('deep_work_actual_min', 'is', null);
  if (error) throw error;

  const observations = (data ?? []).map((h) => h.deep_work_actual_min!).filter((v) => v != null);
  const sampleSize = observations.length;
  const confidence = confidenceForSampleSize(sampleSize);
  const usingPrior = sampleSize < MIN_SAMPLE_SIZE_LOW_CONFIDENCE;

  return {
    minutes: usingPrior ? DEFAULT_HISTORICAL_DEEP_WORK_P50_MINUTES_PRIOR : median(observations),
    sampleSize,
    confidence,
    usingPrior,
  };
}

/** Planning-vs-execution for `today`'s previous day. Also the source of the
 *  planning-vs-execution quadrant diagnosis SCREEN_SPEC §7 puts on /insights -- called
 *  directly there rather than through getDayView, which would pull in a full day's risk
 *  assessment and workload sizing just to reach this one field. */
export async function computeYesterdayPlanningExecution(
  client: TypedSupabaseClient,
  userId: string,
  today: LocalDate,
): Promise<PlanningExecutionResult | null> {
  const yesterday = addDays(today, -1);

  const [{ data: review, error: reviewError }, historicalCapacity, { data: sessions, error: sessionError }] =
    await Promise.all([
      client.from('daily_reviews').select('*').eq('user_id', userId).eq('local_date', yesterday).maybeSingle(),
      computeHistoricalCapacityP50Min(client, userId, today),
      client
        .from('task_sessions')
        .select('planned_start, actual_start, tasks!inner(planned_date, planned_start_at, user_id)')
        // Only sessions from a task that was actually timeboxed (A2, docs/FOLLOWUPS.md)
        // carry a real plan to be early/late against -- an untimeboxed task's session
        // has planned_start defaulted to its own actual_start (see focusSessions.ts) and
        // including it here would silently manufacture a "started right on time" delay
        // of 0 for a task that was never scheduled at all.
        .not('tasks.planned_start_at', 'is', null)
        .eq('tasks.planned_date', yesterday)
        .eq('tasks.user_id', userId)
        .order('planned_start', { ascending: true })
        .limit(1),
    ]);
  if (reviewError) throw reviewError;
  if (sessionError) throw sessionError;

  if (!review) return null;

  const firstSession = sessions?.[0];

  return computePlanningExecutionGap({
    plannedDeepWorkMin: review.deep_work_planned_min ?? 0,
    actualDeepWorkMin: review.deep_work_actual_min ?? 0,
    historicalCapacityP50Min: historicalCapacity.minutes,
    plannedStartMin: firstSession ? minutesSinceMidnightUTC(firstSession.planned_start) : null,
    actualStartMin:
      firstSession?.actual_start != null
        ? actualStartMinFrom(minutesSinceMidnightUTC(firstSession.planned_start), firstSession.planned_start, firstSession.actual_start)
        : null,
    mitPlanned: review.mits_planned,
    mitCompleted: review.mits_completed,
  });
}
