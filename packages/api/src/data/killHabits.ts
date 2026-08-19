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
  /** "Levels 2-4 are opt-in per behavior" -- defaults to l1 (migration 0016's DB
   *  default) if omitted, meaning this habit can never auto-escalate past a stronger
   *  notification until explicitly raised via setMaxEscalationLevel. */
  maxEscalationLevel?: CommitmentLevel;
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
      ...(input.maxEscalationLevel != null ? { max_escalation_level: input.maxEscalationLevel } : {}),
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

export interface UpdateKillHabitInput {
  name?: string;
  triggerDescription?: string | null;
  urgeDescription?: string | null;
  immediateReward?: string | null;
  longTermCost?: string | null;
  replacementBehavior?: string | null;
  implementationIntention?: string | null;
}

/** Edits the descriptive chain only -- name, trigger/urge/reward/cost/replacement,
 *  implementation intention. Never touches escalation_level or max_escalation_level;
 *  the ceiling has its own dedicated setMaxEscalationLevel, deliberately kept separate
 *  so an edit to "what the urge feels like" can never accidentally also raise how far
 *  this habit is allowed to escalate. */
export async function updateKillHabit(
  client: TypedSupabaseClient,
  userId: string,
  killHabitId: number,
  input: UpdateKillHabitInput,
): Promise<DataResult<KillHabitRow>> {
  const { data, error } = await client
    .from('kill_habits')
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.triggerDescription !== undefined ? { trigger_description: input.triggerDescription } : {}),
      ...(input.urgeDescription !== undefined ? { urge_description: input.urgeDescription } : {}),
      ...(input.immediateReward !== undefined ? { immediate_reward: input.immediateReward } : {}),
      ...(input.longTermCost !== undefined ? { long_term_cost: input.longTermCost } : {}),
      ...(input.replacementBehavior !== undefined ? { replacement_behavior: input.replacementBehavior } : {}),
      ...(input.implementationIntention !== undefined ? { implementation_intention: input.implementationIntention } : {}),
    })
    .eq('id', killHabitId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** The explicit opt-in action for "levels 2-4 are opt-in per behavior" -- a user
 *  deliberately choosing, for THIS specific habit, to allow it to auto-escalate that
 *  far. Never set as a side effect of anything else (no auto-raise on relapse count,
 *  no default-to-max) -- that's the whole point of the rule. */
export async function setMaxEscalationLevel(
  client: TypedSupabaseClient,
  userId: string,
  killHabitId: number,
  maxEscalationLevel: CommitmentLevel,
): Promise<DataResult<KillHabitRow>> {
  const { data, error } = await client
    .from('kill_habits')
    .update({ max_escalation_level: maxEscalationLevel })
    .eq('id', killHabitId)
    .eq('user_id', userId)
    .select('*')
    .single();
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
