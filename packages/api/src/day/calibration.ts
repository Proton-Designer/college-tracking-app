import {
  computeCalibrationWithFallback,
  localDateFromInstant,
  type CalibrationWithFallbackResult,
  type DurationObservation,
  type LocalDate,
} from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';

const LOOKBACK_DAYS = 180;

/**
 * Loads every session with a recorded actual duration for the user ONCE (not once per
 * category — avoiding the N+1 that a naive per-task calibration lookup would create) and
 * groups by task category. The full unfiltered list doubles as the "global" fallback
 * packages/core's calibration falls back to when a category has too little history.
 */
// @barrel-internal -- feeds getDayView/computeCapacityHorizon/workload internally; consumers get its
// output through those already-exported functions, not by calling this directly.
export async function loadCalibrationObservations(
  client: TypedSupabaseClient,
  userId: string,
  timezone: string,
  now: Date,
): Promise<{ byCategory: Map<string, DurationObservation[]>; global: DurationObservation[] }> {
  const since = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await client
    .from('task_sessions')
    .select('planned_duration_min, actual_duration_min, created_at, tasks!inner(category, user_id)')
    .eq('tasks.user_id', userId)
    // 'completed' only -- an abandoned session's actual_duration_min is real (how long
    // they worked before stopping), but it's not an observation of how long the TASK
    // takes, and must never train the multiplier as if it were. See migration 0012.
    .eq('status', 'completed')
    .gte('created_at', since);
  if (error) throw error;

  const byCategory = new Map<string, DurationObservation[]>();
  const global: DurationObservation[] = [];

  for (const row of data ?? []) {
    const observation: DurationObservation = {
      estimatedMin: row.planned_duration_min,
      actualMin: row.actual_duration_min!,
      completedAt: localDateFromInstant(new Date(row.created_at), timezone),
    };
    global.push(observation);
    const category = (row.tasks as unknown as { category: string }).category;
    const list = byCategory.get(category) ?? [];
    list.push(observation);
    byCategory.set(category, list);
  }

  return { byCategory, global };
}

// @barrel-internal -- feeds getDayView/computeCapacityHorizon/workload internally; consumers get its
// output through those already-exported functions, not by calling this directly.
export function calibrateCategory(
  observations: { byCategory: Map<string, DurationObservation[]>; global: DurationObservation[] },
  category: string,
  today: LocalDate,
): CalibrationWithFallbackResult {
  return computeCalibrationWithFallback(observations.byCategory.get(category) ?? [], observations.global, today);
}

export interface CalibrationTableRow {
  category: string;
  result: CalibrationWithFallbackResult;
}

/** The personal-multiplier table SCREEN_SPEC §7 puts on /insights -- one row per task
 *  category the user has completed sessions for, sorted alphabetically. Reuses the exact
 *  same observations and per-category calibration Today's workload sizing already runs
 *  on, so the table can never disagree with the multiplier actually applied elsewhere. */
export async function listCalibrationTable(
  client: TypedSupabaseClient,
  userId: string,
  timezone: string,
  now: Date,
): Promise<CalibrationTableRow[]> {
  const observations = await loadCalibrationObservations(client, userId, timezone, now);
  const today = localDateFromInstant(now, timezone);
  const categories = [...observations.byCategory.keys()].sort();
  return categories.map((category) => ({ category, result: calibrateCategory(observations, category, today) }));
}
