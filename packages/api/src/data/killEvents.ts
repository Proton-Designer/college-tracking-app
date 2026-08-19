import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type KillEventRow = Database['public']['Tables']['kill_events']['Row'];
export type KillEventOutcome = 'relapsed' | 'resisted';

export interface LogKillEventInput {
  killHabitId: number;
  outcome: KillEventOutcome;
  /** Defaults to now -- "time" is one of the brief's three five-second fields, but it's
   *  captured for free by the act of logging, never something the user types. */
  occurredAt?: Date;
  triggerContext?: string;
  moodBefore?: number;
  /** Auto-detected from screen telemetry later where possible (kill_events.duration_min's
   *  own column comment) -- never asked for at capture time. Accepted here only for that
   *  later automated path, not as a manual field the five-second flow should ever surface. */
  durationMin?: number;
}

/**
 * The brief's five-second capture: time (free, from `occurredAt`/now), trigger, mood
 * before. Everything else -- including `durationMin` -- is optional at the schema level
 * and stays optional here; this function does not invent required fields the table
 * doesn't already enforce. `outcome` is the one thing that isn't really "extra typing":
 * it's which of two buttons the user tapped ("I gave in" / "I resisted"), not a field to fill in.
 *
 * No correlation columns (e.g. a related task/session id) by design -- the brief's
 * "failures cluster after difficult study blocks" insight is an L8 analysis derivable
 * from `occurred_at` against existing session/calendar timestamps later. A foreign key
 * the user has to supply at capture time would break the five-second rule for a value
 * that's computable without ever asking for it.
 */
export async function logKillEvent(
  client: TypedSupabaseClient,
  userId: string,
  input: LogKillEventInput,
): Promise<DataResult<KillEventRow>> {
  const { data, error } = await client
    .from('kill_events')
    .insert({
      user_id: userId,
      kill_habit_id: input.killHabitId,
      outcome: input.outcome,
      occurred_at: (input.occurredAt ?? new Date()).toISOString(),
      // A BEFORE INSERT trigger (sync_local_date_from_occurred_at, migration 0007)
      // unconditionally overwrites this from occurred_at + the user's own timezone --
      // the column has no DB default, only a required generated-type placeholder here.
      // Must be a syntactically valid date literal (Postgres validates input type before
      // the trigger runs, even though the trigger discards this value immediately after).
      local_date: '1970-01-01',
      ...(input.triggerContext != null ? { trigger_context: input.triggerContext } : {}),
      ...(input.moodBefore != null ? { mood_before: input.moodBefore } : {}),
      ...(input.durationMin != null ? { duration_min: input.durationMin } : {}),
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function listKillEvents(
  client: TypedSupabaseClient,
  userId: string,
  killHabitId?: number,
): Promise<DataResult<KillEventRow[]>> {
  let query = client.from('kill_events').select('*').eq('user_id', userId).order('occurred_at', { ascending: false });
  if (killHabitId != null) query = query.eq('kill_habit_id', killHabitId);
  const { data, error } = await query;
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
