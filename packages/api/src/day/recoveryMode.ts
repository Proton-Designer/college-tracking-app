import { addDays, computeRecoveryModeTrigger, type LocalDate, type RecoveryModeResult } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';

const HARD_DEADLINE_WINDOW_HOURS = 48;

export async function computeTodayRecoveryMode(
  client: TypedSupabaseClient,
  userId: string,
  today: LocalDate,
  sleepBaselineHours: number | null,
): Promise<RecoveryModeResult> {
  const yesterday = addDays(today, -1);
  const deadlineHorizon = new Date(`${today}T00:00:00Z`);
  deadlineHorizon.setUTCHours(deadlineHorizon.getUTCHours() + HARD_DEADLINE_WINDOW_HOURS);

  const [
    { data: todayHealth, error: healthError },
    { data: overdueTasks, error: overdueError },
    { data: hardDeadlines, error: deadlineError },
    { data: yesterdayCheckin, error: checkinError },
    { data: yesterdayMits, error: mitError },
    { data: todayCalendar, error: calError },
    { data: compressedBackplans, error: backplanError },
  ] = await Promise.all([
    client.from('health_daily').select('sleep_hours, whoop_recovery_pct').eq('user_id', userId).eq('local_date', today).maybeSingle(),
    client.from('tasks').select('id').eq('user_id', userId).lt('planned_date', today).not('status', 'in', '(completed,cancelled)'),
    client
      .from('deliverables')
      .select('id')
      .eq('user_id', userId)
      .neq('status', 'completed')
      .lte('due_at', deadlineHorizon.toISOString())
      .gte('due_at', new Date(`${today}T00:00:00Z`).toISOString()),
    client.from('daily_checkins').select('id').eq('user_id', userId).eq('local_date', yesterday).maybeSingle(),
    client.from('tasks').select('id, status').eq('user_id', userId).eq('planned_date', yesterday).not('mit_rank', 'is', null),
    client
      .from('calendar_events')
      .select('start_at, end_at')
      .eq('user_id', userId)
      .eq('is_busy', true)
      .gte('start_at', `${today}T00:00:00Z`)
      .lt('start_at', `${addDays(today, 1)}T00:00:00Z`),
    client
      .from('deliverable_backplans')
      .select('id, deliverables!inner(status)')
      .eq('user_id', userId)
      .eq('compressed', true)
      .neq('deliverables.status', 'completed'),
  ]);
  if (healthError) throw healthError;
  if (overdueError) throw overdueError;
  if (deadlineError) throw deadlineError;
  if (checkinError) throw checkinError;
  if (mitError) throw mitError;
  if (calError) throw calError;
  if (backplanError) throw backplanError;

  const committedCalendarHours = (todayCalendar ?? []).reduce((sum, e) => {
    const hours = (new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) / (1000 * 60 * 60);
    return sum + Math.max(hours, 0);
  }, 0);

  const yesterdayMitCompletionCount = (yesterdayMits ?? []).filter((t) => t.status === 'completed').length;

  return computeRecoveryModeTrigger({
    sleepHours: todayHealth?.sleep_hours != null ? Number(todayHealth.sleep_hours) : null,
    sleepBaselineHours,
    whoopRecoveryPct: todayHealth?.whoop_recovery_pct != null ? Number(todayHealth.whoop_recovery_pct) : null,
    overdueTaskCount: overdueTasks?.length ?? 0,
    hardDeadlinesWithin48h: hardDeadlines?.length ?? 0,
    missedYesterdayCheckin: yesterdayCheckin == null,
    yesterdayMitCompletionCount,
    committedCalendarHours,
    anyActiveBackplanCompressed: (compressedBackplans?.length ?? 0) > 0,
  });
}
