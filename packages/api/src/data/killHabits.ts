import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type KillHabitRow = Database['public']['Tables']['kill_habits']['Row'];
export type CommitmentLevel = Database['public']['Enums']['commitment_level'];

export interface CreateKillHabitInput {
  name: string;
  /** The brief's chain (behavior=name, trigger, urge, action is the logged event itself,
   *  immediate reward, long-term cost, replacement behavior) plus the if-then
   *  implementation intention -- one per habit, per the brief's own wording ("for each
   *  kill habit, create an implementation intention"), not a separate table. */
  triggerDescription?: string;
  urgeDescription?: string;
  immediateReward?: string;
  longTermCost?: string;
  replacementBehavior?: string;
  implementationIntention?: string;
  escalationLevel?: CommitmentLevel;
}

export async function createKillHabit(
  client: TypedSupabaseClient,
  userId: string,
  input: CreateKillHabitInput,
): Promise<DataResult<KillHabitRow>> {
  const { data, error } = await client
    .from('kill_habits')
    .insert({
      user_id: userId,
      name: input.name,
      ...(input.triggerDescription != null ? { trigger_description: input.triggerDescription } : {}),
      ...(input.urgeDescription != null ? { urge_description: input.urgeDescription } : {}),
      ...(input.immediateReward != null ? { immediate_reward: input.immediateReward } : {}),
      ...(input.longTermCost != null ? { long_term_cost: input.longTermCost } : {}),
      ...(input.replacementBehavior != null ? { replacement_behavior: input.replacementBehavior } : {}),
      ...(input.implementationIntention != null ? { implementation_intention: input.implementationIntention } : {}),
      ...(input.escalationLevel != null ? { escalation_level: input.escalationLevel } : {}),
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Active habits by default -- the kill-list section (SCREEN_SPEC §1.6) shows today's
 *  active commitments, not a full lifetime history. */
export async function listKillHabits(
  client: TypedSupabaseClient,
  userId: string,
  activeOnly = true,
): Promise<DataResult<KillHabitRow[]>> {
  let query = client.from('kill_habits').select('*').eq('user_id', userId).order('created_at');
  if (activeOnly) query = query.eq('active', true);
  const { data, error } = await query;
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Soft-deactivate, not delete -- a retired habit's history (kill_events) stays intact
 *  for bounce-back scoring and future review, matching this schema's selective
 *  soft-delete convention elsewhere. */
export async function deactivateKillHabit(
  client: TypedSupabaseClient,
  userId: string,
  killHabitId: number,
): Promise<DataResult<KillHabitRow>> {
  const { data, error } = await client
    .from('kill_habits')
    .update({ active: false })
    .eq('id', killHabitId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
