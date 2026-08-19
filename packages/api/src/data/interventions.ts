import type { LocalDate } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type InterventionRow = Database['public']['Tables']['interventions']['Row'];
export type InterventionKind = InterventionRow['kind'];
export type InterventionStatus = InterventionRow['status'];

export interface CreateInterventionInput {
  kind: InterventionKind;
  triggerReason: string;
  message: string;
  actions: string[];
  relatedTaskId?: number;
  relatedKillHabitId?: number;
}

/** Persists an intended intervention -- the decision-and-record layer the brief's
 *  north-star measurement (did an intervention actually change behavior) depends on.
 *  Always created `status: 'pending'`; the UI marks it delivered once actually shown,
 *  since with no push infrastructure "created" and "delivered" are genuinely
 *  different moments (a client that's been closed for an hour hasn't delivered
 *  anything just because the row exists). */
export async function createIntervention(
  client: TypedSupabaseClient,
  userId: string,
  input: CreateInterventionInput,
): Promise<DataResult<InterventionRow>> {
  const { data, error } = await client
    .from('interventions')
    .insert({
      user_id: userId,
      kind: input.kind,
      trigger_reason: input.triggerReason,
      message: input.message,
      actions: input.actions,
      related_task_id: input.relatedTaskId ?? null,
      related_kill_habit_id: input.relatedKillHabitId ?? null,
      // Overwritten by a BEFORE INSERT trigger (sync_local_date_from_occurred_at) from
      // occurred_at + the user's own timezone -- the column has no DB default, only a
      // required generated-type placeholder here (same pattern as killEvents.ts).
      local_date: '1970-01-01',
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Marks an intervention delivered -- separate from creation, since with no push
 *  infrastructure the row can exist before the user has actually seen it. */
export async function markInterventionDelivered(client: TypedSupabaseClient, interventionId: number): Promise<DataResult<InterventionRow>> {
  const { data, error } = await client
    .from('interventions')
    .update({ status: 'delivered' })
    .eq('id', interventionId)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export interface RecordInterventionResponseInput {
  /** Ignored is the honest response to "the user saw it and did nothing" -- distinct
   *  from acted_on, since the whole point of tracking this is measuring whether
   *  interventions actually change behavior, and "shown but ignored" is a real,
   *  countable outcome, not an absence of data. */
  status: 'acted_on' | 'ignored';
  /** Required when status is 'acted_on' -- must be one of the intervention's own
   *  `actions` (checked in application code, not the DB, since the DB would need a
   *  trigger to validate against a sibling array column and this is the one call site
   *  that ever sets both together). */
  actionTaken?: string;
}

export async function recordInterventionResponse(
  client: TypedSupabaseClient,
  interventionId: number,
  input: RecordInterventionResponseInput,
): Promise<DataResult<InterventionRow>> {
  if (input.status === 'acted_on' && !input.actionTaken) {
    return dataErr({ code: 'validation', message: 'actionTaken is required when recording an acted_on response.' });
  }
  const { data, error } = await client
    .from('interventions')
    .update({ status: input.status, action_taken: input.actionTaken ?? null, responded_at: new Date().toISOString() })
    .eq('id', interventionId)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function getIntervention(client: TypedSupabaseClient, interventionId: number): Promise<DataResult<InterventionRow | null>> {
  const { data, error } = await client.from('interventions').select('*').eq('id', interventionId).maybeSingle();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Everything still awaiting delivery or a response -- what the UI polls to know what
 *  to show right now. */
export async function listPendingInterventions(client: TypedSupabaseClient, userId: string): Promise<DataResult<InterventionRow[]>> {
  const { data, error } = await client
    .from('interventions')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'delivered'])
    .order('occurred_at');
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function listInterventionsForDate(client: TypedSupabaseClient, userId: string, localDate: LocalDate): Promise<DataResult<InterventionRow[]>> {
  const { data, error } = await client.from('interventions').select('*').eq('user_id', userId).eq('local_date', localDate).order('occurred_at');
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
