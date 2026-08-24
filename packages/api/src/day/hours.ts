import type { LocalDate } from '@collegeos/core';
import type { CompletedHour, DayFacts } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from '../data/types';
import { mapDataError } from '../data/errors';
import type { TaskSessionRow } from './focusSessions';

export type DistractionRow = Database['public']['Tables']['distractions']['Row'];
export type DistractionCause = Database['public']['Enums']['distraction_cause'];
export type DayRow = Database['public']['Tables']['days']['Row'];

/**
 * The Deep Work Hour's data layer. Hours live in `task_sessions` (ruling C1) and are
 * distinguished from ordinary task sessions by `hour_index` being non-null -- every query
 * here filters on that, so an Hour count can never be inflated by historical task
 * sessions.
 *
 * Ending and resuming an Hour deliberately reuse `completeFocusSession`,
 * `abandonFocusSession` and `getActiveFocusSession` unchanged: none of them look at
 * `task_id`, all of them already handle the active/completed/abandoned lifecycle, and
 * `endFocusSession` already server-computes `actual_duration_min` from the stored
 * `actual_start` rather than trusting a client-supplied elapsed time. Duplicating that
 * here would be a second lifecycle to keep in sync for no gain.
 */

export interface StartHourInput {
  /** The one specific thing this Hour produces. Required -- see the guard below. */
  deliverable: string;
  /** School / MyHomeBase / Content / ... open-ended by design. */
  category?: string;
  /** Defaults to the blueprint's 60-minute Hour. */
  plannedDurationMin?: number;
  /**
   * The caller's local day, from `getUserLocalToday`. Passed in rather than computed here
   * so there stays exactly one place a clock-related bug can live (see day/today.ts).
   */
  localDate: LocalDate;
  location?: string;
}

const DEFAULT_HOUR_MINUTES = 60;

/**
 * Arms the timer. The Hour's index within the day is assigned here rather than by the
 * client, so two devices cannot both think they are starting Hour 2.
 *
 * A one-line deliverable is REQUIRED and the blank case is refused. That is the
 * blueprint's "no plan made last night" failure mode by design: the friction is five
 * seconds of typing, not a lecture, and an Hour with no stated deliverable is exactly the
 * unfalsifiable "I did work" record the whole Work Form System exists to prevent.
 */
export async function startHour(
  client: TypedSupabaseClient,
  userId: string,
  input: StartHourInput,
  now: Date = new Date(),
): Promise<DataResult<TaskSessionRow>> {
  const deliverable = input.deliverable.trim();
  if (deliverable.length === 0) {
    return dataErr({ code: 'validation', message: 'An Hour needs a one-line deliverable before it can start.' });
  }

  // One active session per user is enforced by a partial unique index (migration 12), so
  // this check is the friendly error rather than the guarantee -- a race still ends in a
  // constraint violation, not two live timers.
  const { data: existing, error: existingError } = await client
    .from('task_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (existingError) return dataErr(mapDataError(existingError));
  if (existing) {
    return dataErr({
      code: 'conflict',
      message: 'An Hour is already running. End it before starting another.',
    });
  }

  const { count, error: countError } = await client
    .from('task_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('local_date', input.localDate)
    .not('hour_index', 'is', null);
  if (countError) return dataErr(mapDataError(countError));

  const nowIso = now.toISOString();
  const { data, error } = await client
    .from('task_sessions')
    .insert({
      user_id: userId,
      task_id: null,
      hour_index: (count ?? 0) + 1,
      deliverable,
      // planned_start is "when this Hour was planned to begin", and for an ad-hoc Start
      // Hour that is now -- an honest statement, not a placeholder.
      planned_start: nowIso,
      actual_start: nowIso,
      planned_duration_min: input.plannedDurationMin ?? DEFAULT_HOUR_MINUTES,
      status: 'active',
      ...(input.category != null ? { category: input.category } : {}),
      ...(input.location != null ? { location: input.location } : {}),
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/**
 * One +1 Distraction tap, with its cause.
 *
 * `task_sessions.interruptions` is NOT updated here -- a database trigger keeps it equal
 * to the number of rows in this table (migration 34). Writing both from application code
 * would drift the moment one write failed, and an under-counted Hour looks exactly like a
 * focused one.
 */
export async function logDistraction(
  client: TypedSupabaseClient,
  userId: string,
  sessionId: number,
  cause: DistractionCause,
  now: Date = new Date(),
): Promise<DataResult<DistractionRow>> {
  const { data, error } = await client
    .from('distractions')
    .insert({ user_id: userId, session_id: sessionId, cause, occurred_at: now.toISOString() })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Every distraction logged against one Hour, oldest first -- the cause breakdown. */
export async function listDistractionsForSession(
  client: TypedSupabaseClient,
  userId: string,
  sessionId: number,
): Promise<DataResult<DistractionRow[]>> {
  const { data, error } = await client
    .from('distractions')
    .select('*')
    .eq('user_id', userId)
    .eq('session_id', sessionId)
    .order('occurred_at', { ascending: true });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

/** Every Hour logged on one local day, in order. Includes unfinished and abandoned ones. */
export async function listHoursForDate(
  client: TypedSupabaseClient,
  userId: string,
  localDate: LocalDate,
): Promise<DataResult<TaskSessionRow[]>> {
  const { data, error } = await client
    .from('task_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('local_date', localDate)
    .not('hour_index', 'is', null)
    .order('hour_index', { ascending: true });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

/**
 * Completed Hours across a date range, mapped into the shape `packages/core` consumes.
 * The Wall and every Day Won / Delta / bounce-back computation read through this, so the
 * database-row-to-domain-value mapping lives in exactly one place.
 *
 * Only `status = 'completed'` rows are returned: an abandoned Hour is real elapsed time
 * (and stays in the table) but it did not produce a completed Hour, and counting it
 * toward a day's baseline would make Day Won mean something weaker than it says.
 */
export async function listCompletedHoursInRange(
  client: TypedSupabaseClient,
  userId: string,
  fromDate: LocalDate,
  toDate: LocalDate,
): Promise<DataResult<CompletedHour[]>> {
  const { data, error } = await client
    .from('task_sessions')
    .select('local_date, hour_index, actual_start, actual_duration_min, status')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .not('hour_index', 'is', null)
    .gte('local_date', fromDate)
    .lte('local_date', toDate)
    .order('local_date', { ascending: true });
  if (error) return dataErr(mapDataError(error));

  const hours: CompletedHour[] = [];
  for (const row of data ?? []) {
    if (row.local_date == null || row.hour_index == null || row.actual_start == null) continue;
    // The Hour's end instant is not stored -- actual_duration_min is. Derived here rather
    // than adding a column, so there is no second timestamp that can disagree with the
    // duration the server already computed at end time.
    const endedAt = new Date(
      new Date(row.actual_start).getTime() + (row.actual_duration_min ?? 0) * 60_000,
    ).toISOString();
    hours.push({
      localDate: row.local_date,
      hourIndex: row.hour_index,
      endedAt,
      minutes: row.actual_duration_min ?? 0,
    });
  }
  return dataOk(hours);
}

/** The stored row for one local day, or null if the day has never been touched. */
export async function getDay(
  client: TypedSupabaseClient,
  userId: string,
  localDate: LocalDate,
): Promise<DataResult<DayRow | null>> {
  const { data, error } = await client
    .from('days')
    .select('*')
    .eq('user_id', userId)
    .eq('local_date', localDate)
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/**
 * "Start Day" -- records the wake time Delta is measured from.
 *
 * Deliberately idempotent, and deliberately NOT an overwrite: tapping Start Day a second
 * time returns the day unchanged rather than resetting `wake_at`. Delta is a race against
 * the moment you got up, so a later tap that moved the start line would silently improve
 * every number derived from it -- the one kind of dishonesty this metric cannot tolerate.
 *
 * Written as insert-ignore then update-where-null so two taps racing each other end with
 * one row and one wake time, rather than relying on the client to check first.
 */
export async function startDay(
  client: TypedSupabaseClient,
  userId: string,
  localDate: LocalDate,
  now: Date = new Date(),
): Promise<DataResult<DayRow>> {
  const { error: insertError } = await client
    .from('days')
    .upsert({ user_id: userId, local_date: localDate }, { onConflict: 'user_id,local_date', ignoreDuplicates: true });
  if (insertError) return dataErr(mapDataError(insertError));

  const { error: updateError } = await client
    .from('days')
    .update({ wake_at: now.toISOString() })
    .eq('user_id', userId)
    .eq('local_date', localDate)
    .is('wake_at', null);
  if (updateError) return dataErr(mapDataError(updateError));

  const { data, error } = await client
    .from('days')
    .select('*')
    .eq('user_id', userId)
    .eq('local_date', localDate)
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/**
 * Closes the day: the Night Plan's sleep-intent stamp.
 *
 * Unlike `startDay` this DOES overwrite. Re-running the Night Plan is a normal thing to do
 * -- you closed the day, then stayed up another hour and closed it again -- and the latest
 * stated intent is the true one. The DB's days_sleep_after_wake check refuses a sleep
 * intent that precedes the wake time, so a wrong-day tap surfaces as an error rather than
 * a negative day length.
 */
export async function setSleepIntent(
  client: TypedSupabaseClient,
  userId: string,
  localDate: LocalDate,
  now: Date = new Date(),
): Promise<DataResult<DayRow>> {
  const { error: insertError } = await client
    .from('days')
    .upsert({ user_id: userId, local_date: localDate }, { onConflict: 'user_id,local_date', ignoreDuplicates: true });
  if (insertError) return dataErr(mapDataError(insertError));

  const { data, error } = await client
    .from('days')
    .update({ sleep_intent_at: now.toISOString() })
    .eq('user_id', userId)
    .eq('local_date', localDate)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** The stored day facts for a range, mapped for `packages/core`. */
export async function listDayFactsInRange(
  client: TypedSupabaseClient,
  userId: string,
  fromDate: LocalDate,
  toDate: LocalDate,
): Promise<DataResult<DayFacts[]>> {
  const { data, error } = await client
    .from('days')
    .select('local_date, wake_at, baseline_hours')
    .eq('user_id', userId)
    .gte('local_date', fromDate)
    .lte('local_date', toDate)
    .order('local_date', { ascending: true });
  if (error) return dataErr(mapDataError(error));
  return dataOk(
    (data ?? []).map((row) => ({
      localDate: row.local_date,
      wakeAt: row.wake_at,
      baselineHours: row.baseline_hours,
    })),
  );
}

export interface WallTile {
  id: number;
  localDate: LocalDate;
  hourIndex: number;
  deliverable: string | null;
  category: string | null;
  interruptions: number;
  minutes: number;
}

/**
 * The Wall -- every completed Hour as a tile, newest first.
 *
 * Completed only. The Wall is the product's proof surface and the blueprint is explicit
 * that it must only ever grow and never read as debt, so an abandoned Hour does not appear
 * on it. That is not hiding a failure: the abandoned row still exists, still carries its
 * real elapsed time, and still feeds the calibration engine. It simply is not proof of a
 * finished Hour, which is the one thing this surface claims.
 */
export async function listWall(
  client: TypedSupabaseClient,
  userId: string,
  limit = 200,
): Promise<DataResult<WallTile[]>> {
  const { data, error } = await client
    .from('task_sessions')
    .select('id, local_date, hour_index, deliverable, category, interruptions, actual_duration_min')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .not('hour_index', 'is', null)
    .order('local_date', { ascending: false })
    .order('hour_index', { ascending: false })
    .limit(limit);
  if (error) return dataErr(mapDataError(error));

  const tiles: WallTile[] = [];
  for (const row of data ?? []) {
    if (row.local_date == null || row.hour_index == null) continue;
    tiles.push({
      id: row.id,
      localDate: row.local_date,
      hourIndex: row.hour_index,
      deliverable: row.deliverable,
      category: row.category,
      interruptions: row.interruptions,
      minutes: row.actual_duration_min ?? 0,
    });
  }
  return dataOk(tiles);
}
