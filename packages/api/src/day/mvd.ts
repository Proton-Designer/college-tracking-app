import { composeMinimumViableDay, daysBetween, type LocalDate, type MvdCandidateItem, type MvdPlan } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
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
export async function composeMvdPlanForToday(
  client: TypedSupabaseClient,
  userId: string,
  today: LocalDate,
  deliverableRisks: DeliverableRisk[],
  sleepBaselineHours: number | null,
): Promise<MvdPlan> {
  const [{ data: tasks, error: taskError }, { data: events, error: eventError }] = await Promise.all([
    client
      .from('tasks')
      .select('id, title, deliverable_id')
      .eq('user_id', userId)
      .eq('planned_date', today)
      .not('status', 'in', '(completed,cancelled)'),
    client
      .from('calendar_events')
      .select('id, title')
      .eq('user_id', userId)
      .eq('is_busy', true)
      .eq('is_class_meeting', true)
      .gte('start_at', `${today}T00:00:00Z`)
      .lt('start_at', `${today}T23:59:59Z`),
  ]);
  if (taskError) throw taskError;
  if (eventError) throw eventError;

  const riskByDeliverable = new Map(deliverableRisks.map((r) => [r.deliverableId, r]));

  const items: MvdCandidateItem[] = [];

  for (const event of events ?? []) {
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
