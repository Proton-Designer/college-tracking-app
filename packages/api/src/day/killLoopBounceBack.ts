import { addDays, computeBounceBack, localDateFromInstant, type BounceBackResult, type DayOutcome, type LocalDate } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import { dataErr, dataOk, type DataResult } from '../data/types';
import { mapDataError } from '../data/errors';

/**
 * Wires packages/core's bounce-back scoring (§5 -- time-to-recovery, deliberately not a
 * streak) to real kill_events for one habit, across [habit.created_at's local date, today].
 *
 * The invariant that matters most here: a day with no logged kill_event for this habit is
 * 'untracked', never a default 'success'. Absence of a relapse log is not evidence of
 * resistance -- it might just be a day nothing got recorded. Treating a gap as a win would
 * turn this into exactly the participation-trophy streak metric the brief chose bounce-back
 * OVER. A day only becomes 'success' from an explicit 'resisted' event, and only becomes
 * 'failure' from an explicit 'relapsed' event (which wins if a day somehow has both).
 */
export async function computeHabitBounceBack(
  client: TypedSupabaseClient,
  userId: string,
  killHabitId: number,
  today: LocalDate,
  timezone: string,
): Promise<DataResult<BounceBackResult>> {
  const { data: habit, error: habitError } = await client
    .from('kill_habits')
    .select('created_at')
    .eq('id', killHabitId)
    .eq('user_id', userId)
    .single();
  if (habitError) return dataErr(mapDataError(habitError));

  // B4: `created_at` is an instant; the day it belongs to is a LOCAL day. Slicing the UTC
  // ISO string can push the start date a day later than the habit really began (any
  // evening creation in a negative-offset zone), which silently excludes day one's
  // kill_events from the series below and understates the first bounce-back.
  const startDate: LocalDate = localDateFromInstant(new Date(habit.created_at), timezone);

  const { data: events, error: eventsError } = await client
    .from('kill_events')
    .select('local_date, outcome')
    .eq('user_id', userId)
    .eq('kill_habit_id', killHabitId)
    .gte('local_date', startDate)
    .lte('local_date', today);
  if (eventsError) return dataErr(mapDataError(eventsError));

  const outcomeByDate = new Map<LocalDate, 'success' | 'failure'>();
  for (const event of events ?? []) {
    if (event.outcome === 'relapsed') {
      // A relapse always wins over a resisted event logged the same day -- one lapse
      // makes it a lapse day, regardless of how many urges were also resisted that day.
      outcomeByDate.set(event.local_date, 'failure');
    } else if (event.outcome === 'resisted' && outcomeByDate.get(event.local_date) !== 'failure') {
      outcomeByDate.set(event.local_date, 'success');
    }
  }

  const series: DayOutcome[] = [];
  for (let d = startDate; d <= today; d = addDays(d, 1)) {
    series.push({ date: d, outcome: outcomeByDate.get(d) ?? 'untracked' });
  }

  return dataOk(computeBounceBack(series));
}
