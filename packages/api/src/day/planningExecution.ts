import { addDays, computePlanningExecutionGap, type LocalDate, type PlanningExecutionResult } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';

const HISTORICAL_CAPACITY_LOOKBACK_DAYS = 30;

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

/**
 * Planning-vs-execution for `today`'s previous day. `historicalCapacityP50Min` is the
 * median actual deep-work minutes over the last 30 days of night reviews — the closest
 * real signal to packages/core's "historicalDeepWorkP50Minutes" without a dedicated
 * rolling-stats table.
 */
export async function computeYesterdayPlanningExecution(
  client: TypedSupabaseClient,
  userId: string,
  today: LocalDate,
): Promise<PlanningExecutionResult | null> {
  const yesterday = addDays(today, -1);
  const lookbackStart = addDays(today, -HISTORICAL_CAPACITY_LOOKBACK_DAYS);

  const [{ data: review, error: reviewError }, { data: history, error: historyError }, { data: sessions, error: sessionError }] =
    await Promise.all([
      client.from('daily_reviews').select('*').eq('user_id', userId).eq('local_date', yesterday).maybeSingle(),
      client
        .from('daily_reviews')
        .select('deep_work_actual_min')
        .eq('user_id', userId)
        .gte('local_date', lookbackStart)
        .not('deep_work_actual_min', 'is', null),
      client
        .from('task_sessions')
        .select('planned_start, actual_start, tasks!inner(planned_date, user_id)')
        .eq('tasks.planned_date', yesterday)
        .eq('tasks.user_id', userId)
        .order('planned_start', { ascending: true })
        .limit(1),
    ]);
  if (reviewError) throw reviewError;
  if (historyError) throw historyError;
  if (sessionError) throw sessionError;

  if (!review) return null;

  const historicalCapacityP50Min = median((history ?? []).map((h) => h.deep_work_actual_min!).filter((v) => v != null));
  const firstSession = sessions?.[0];

  return computePlanningExecutionGap({
    plannedDeepWorkMin: review.deep_work_planned_min ?? 0,
    actualDeepWorkMin: review.deep_work_actual_min ?? 0,
    historicalCapacityP50Min,
    plannedStartMin: firstSession ? minutesSinceMidnightUTC(firstSession.planned_start) : 0,
    actualStartMin: firstSession?.actual_start ? minutesSinceMidnightUTC(firstSession.actual_start) : 0,
    mitPlanned: review.mits_planned,
    mitCompleted: review.mits_completed,
  });
}
