import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type FrictionLogRow = Database['public']['Tables']['friction_logs']['Row'];
export type FrictionCause = Database['public']['Enums']['friction_cause'];

export interface LogFrictionInput {
  cause: FrictionCause;
  /** The task/MIT this failure is about, when there is one -- unlike kill_events, a
   *  correlation column is the whole point here (friction logging exists to explain a
   *  SPECIFIC incomplete task), not a speculative addition. */
  relatedTaskId?: number;
  causeDetail?: string;
  occurredAt?: Date;
}

/** One-tap "why did this fail?" -- cause is the only required field; everything else,
 *  including which task it's about, is optional (a friction moment doesn't always trace
 *  back to one task). */
export async function logFriction(
  client: TypedSupabaseClient,
  userId: string,
  input: LogFrictionInput,
): Promise<DataResult<FrictionLogRow>> {
  const { data, error } = await client
    .from('friction_logs')
    .insert({
      user_id: userId,
      cause: input.cause,
      occurred_at: (input.occurredAt ?? new Date()).toISOString(),
      // Overwritten by a BEFORE INSERT trigger (sync_local_date_from_occurred_at) from
      // occurred_at + the user's timezone -- see killEvents.ts's identical situation for
      // why this must still be a syntactically valid date literal.
      local_date: '1970-01-01',
      ...(input.relatedTaskId != null ? { related_task_id: input.relatedTaskId } : {}),
      ...(input.causeDetail != null ? { cause_detail: input.causeDetail } : {}),
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function listFrictionLogs(
  client: TypedSupabaseClient,
  userId: string,
  range?: { since: string; until: string },
): Promise<DataResult<FrictionLogRow[]>> {
  let query = client.from('friction_logs').select('*').eq('user_id', userId).order('occurred_at', { ascending: false });
  if (range) query = query.gte('local_date', range.since).lte('local_date', range.until);
  const { data, error } = await query;
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
