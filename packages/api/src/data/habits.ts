import type { HabitLogEntry, HabitSchedule, LocalDate } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type HabitRow = Database['public']['Tables']['habits']['Row'];
export type HabitLogRow = Database['public']['Tables']['habit_logs']['Row'];

/**
 * The positive-habit layer (ruling C6 -- alongside kill_habits, never merged).
 *
 * Score and vote count are NOT read from anywhere here: they do not exist in the schema.
 * Callers fetch the log via `listHabitLogsInRange` and hand it to packages/core's
 * `computeHabitScore`. This file is fetch-and-write only.
 */

/** The blueprint's hard cap: max 7 habits visible, ever. Enforced here, not in the schema,
 *  so retiring one habit while creating its replacement is never blocked. */
export const MAX_ACTIVE_HABITS = 7;

export interface CreateHabitInput {
  name: string;
  identity: string;
  whyCard?: string;
  schedule?: HabitSchedule;
}

export async function listHabits(
  client: TypedSupabaseClient,
  userId: string,
  includeRetired = false,
): Promise<DataResult<HabitRow[]>> {
  let query = client.from('habits').select('*').eq('user_id', userId);
  if (!includeRetired) query = query.eq('active', true);
  const { data, error } = await query.order('created_at', { ascending: true });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

export async function createHabit(
  client: TypedSupabaseClient,
  userId: string,
  input: CreateHabitInput,
): Promise<DataResult<HabitRow>> {
  const name = input.name.trim();
  const identity = input.identity.trim();
  if (name.length === 0 || identity.length === 0) {
    return dataErr({ code: 'validation', message: 'A habit needs a name and an identity statement.' });
  }

  // The cap counts ACTIVE habits, so this check and a retire-then-create sequence never
  // fight. Advisory rather than a guarantee (no unique index backs it), which is fine: two
  // racing devices creating an eighth habit is a cosmetic overshoot, not a data corruption.
  const { count, error: countError } = await client
    .from('habits')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('active', true);
  if (countError) return dataErr(mapDataError(countError));
  if ((count ?? 0) >= MAX_ACTIVE_HABITS) {
    return dataErr({
      code: 'validation',
      message: `Seven habits is the ceiling, on purpose. Retire one before adding another.`,
    });
  }

  const { data, error } = await client
    .from('habits')
    .insert({
      user_id: userId,
      name,
      identity,
      ...(input.whyCard != null ? { why_card: input.whyCard } : {}),
      ...(input.schedule != null ? { schedule: { weekdays: input.schedule.weekdays } } : {}),
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export interface UpdateHabitInput {
  name?: string;
  identity?: string;
  whyCard?: string | null;
  paused?: boolean;
  active?: boolean;
}

export async function updateHabit(
  client: TypedSupabaseClient,
  userId: string,
  habitId: number,
  input: UpdateHabitInput,
): Promise<DataResult<HabitRow>> {
  const { data, error } = await client
    .from('habits')
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.identity !== undefined ? { identity: input.identity } : {}),
      ...(input.whyCard !== undefined ? { why_card: input.whyCard } : {}),
      ...(input.paused !== undefined ? { paused: input.paused } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
    })
    .eq('id', habitId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/**
 * Casts (or retracts) the day's vote. Upsert on (habit_id, local_date): re-tapping a
 * check-in flips it rather than erroring, and the unique constraint means two racing taps
 * end as one row.
 */
export async function setHabitVote(
  client: TypedSupabaseClient,
  userId: string,
  habitId: number,
  localDate: LocalDate,
  done: boolean,
): Promise<DataResult<HabitLogRow>> {
  const { data, error } = await client
    .from('habit_logs')
    .upsert(
      { user_id: userId, habit_id: habitId, local_date: localDate, done },
      { onConflict: 'habit_id,local_date' },
    )
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** The log for one habit over a range, in core's domain shape, ready for computeHabitScore. */
export async function listHabitLogsInRange(
  client: TypedSupabaseClient,
  userId: string,
  habitId: number,
  fromDate: LocalDate,
  toDate: LocalDate,
): Promise<DataResult<HabitLogEntry[]>> {
  const { data, error } = await client
    .from('habit_logs')
    .select('local_date, done')
    .eq('user_id', userId)
    .eq('habit_id', habitId)
    .gte('local_date', fromDate)
    .lte('local_date', toDate)
    .order('local_date', { ascending: true });
  if (error) return dataErr(mapDataError(error));
  return dataOk((data ?? []).map((row) => ({ localDate: row.local_date, done: row.done })));
}

/**
 * All-time vote count for one habit. Separate from the range query because the score
 * replays a window while votes are "all time" by definition -- fetching every row ever
 * just to count them would grow without bound.
 */
export async function countHabitVotes(
  client: TypedSupabaseClient,
  userId: string,
  habitId: number,
): Promise<DataResult<number>> {
  const { count, error } = await client
    .from('habit_logs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('habit_id', habitId)
    .eq('done', true);
  if (error) return dataErr(mapDataError(error));
  return dataOk(count ?? 0);
}

/** Today's votes across every habit in one query, for the check-in surface. */
export async function listVotesForDate(
  client: TypedSupabaseClient,
  userId: string,
  localDate: LocalDate,
): Promise<DataResult<HabitLogRow[]>> {
  const { data, error } = await client
    .from('habit_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('local_date', localDate);
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}
