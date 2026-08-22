import { addDays, composeMinimumViableDay, daysBetween, localTimeToInstant, type LocalDate, type MvdCandidateItem, type MvdPlan } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { CalendarEvent } from './calendarEvent';
import type { DeliverableRisk } from './risk';

const HARD_DEADLINE_WINDOW_DAYS = 2;
const DEFAULT_WAKE_HOUR = 7; // 07:00, used only to derive a sleep-by time when none is set

/**
 * Only computed when Recovery Mode has actually triggered (see dayView.ts) -- the
 * candidate classification mirrors workload.ts's (hardDeadline = linked deliverable due
 * within 48h; attendance = today's calendar events; everything else linked to a
 * deliverable is a studyBlock candidate), but MVD selects its one kept study block by
 * the deliverable's raw risk SCORE (packages/core §6: "chosen by §1 risk"), not by risk
 * reduction per minute the way workload/MIT selection does -- a deliberately different
 * criterion, so this does not just reuse buildTodayWorkloadItems's output.
 */
// @barrel-internal -- feeds getDayView's MvdPlan field internally; consumers get its output through
// getDayView, not by calling this directly.
export async function composeMvdPlanForToday(
  client: TypedSupabaseClient,
  userId: string,
  today: LocalDate,
  deliverableRisks: DeliverableRisk[],
  sleepBaselineHours: number | null,
  timezone: string,
  /** The caller's own unbounded calendar_events read (see recoveryMode.ts's identical
   *  parameter for the full reasoning) -- filtered here to today+is_busy+is_class_meeting
   *  in memory instead of a second round trip for the same table. */
  calendarEvents: CalendarEvent[],
): Promise<MvdPlan> {
  // B4: the user's real local day, not UTC midnight -- see CLAUDE.md's "never derive a
  // day boundary from UTC."
  const { data: tasks, error: taskError } = await client
    .from('tasks')
    .select('id, title, deliverable_id')
    .eq('user_id', userId)
    .eq('planned_date', today)
    .not('status', 'in', '(completed,cancelled)');
  if (taskError) throw taskError;

  const todayStartIso = localTimeToInstant(today, 0, 0, timezone);
  const todayEndIso = localTimeToInstant(addDays(today, 1), 0, 0, timezone);
  const events = calendarEvents.filter(
    (e) => e.is_busy && e.is_class_meeting && e.start_at >= todayStartIso && e.start_at < todayEndIso,
  );

  const riskByDeliverable = new Map(deliverableRisks.map((r) => [r.deliverableId, r]));

  const items: MvdCandidateItem[] = [];

  for (const event of events) {
    items.push({ id: `event-${event.id}`, kind: 'attendance' });
  }

  for (const task of tasks ?? []) {
    const deliverableRisk = task.deliverable_id != null ? riskByDeliverable.get(task.deliverable_id) : undefined;
    const isHardDeadline =
      deliverableRisk != null && daysBetween(today, deliverableRisk.input.dueDate) <= HARD_DEADLINE_WINDOW_DAYS;

    if (isHardDeadline) {
      items.push({ id: String(task.id), kind: 'hardDeadline' });
    } else if (deliverableRisk != null) {
      items.push({ id: String(task.id), kind: 'studyBlock', riskScore: deliverableRisk.result.score });
    } else {
      items.push({ id: String(task.id), kind: 'other' });
    }
  }

  // No dedicated "wake time" setting exists yet -- derive a sleep-by time from the
  // user's sleep baseline against a default wake hour. Documented approximation, same
  // spirit as the other L4/L5-flagged schema-gap decisions in docs/DATA_MODEL.md §10.
  const sleepByTime = deriveSleepByTime(sleepBaselineHours);

  return composeMinimumViableDay(items, { sleepByTime });
}

function deriveSleepByTime(sleepBaselineHours: number | null): string {
  const hours = sleepBaselineHours ?? 8;
  let bedHour = DEFAULT_WAKE_HOUR - hours;
  if (bedHour < 0) bedHour += 24;
  const wholeHour = Math.floor(bedHour);
  const minutes = Math.round((bedHour - wholeHour) * 60);
  return `${String(wholeHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
