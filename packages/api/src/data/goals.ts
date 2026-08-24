import type { LocalDate } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type GoalRow = Database['public']['Tables']['goals']['Row'];
export type MilestoneRow = Database['public']['Tables']['milestones']['Row'];

/** The blueprint's cap: five active goals, enforced app-side like MAX_ACTIVE_HABITS. */
export const MAX_ACTIVE_GOALS = 5;

export interface GoalWithMilestone {
  goal: GoalRow;
  /** This month's milestone, or null when none has been set yet. */
  milestone: MilestoneRow | null;
}

/** 'YYYY-MM' of a LocalDate -- the month key milestones are stored under. */
export function monthOf(date: LocalDate): string {
  return date.slice(0, 7);
}

export interface CreateGoalInput {
  title: string;
  number?: string;
  deadline?: LocalDate;
  reason?: string;
}

/** Active goals in position order, each with its current month's milestone attached. */
export async function listGoalsWithMilestones(
  client: TypedSupabaseClient,
  userId: string,
  month: string,
): Promise<DataResult<GoalWithMilestone[]>> {
  const { data: goals, error: goalsError } = await client
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .order('position', { ascending: true });
  if (goalsError) return dataErr(mapDataError(goalsError));

  const { data: milestones, error: msError } = await client
    .from('milestones')
    .select('*')
    .eq('user_id', userId)
    .eq('month', month);
  if (msError) return dataErr(mapDataError(msError));

  const byGoal = new Map((milestones ?? []).map((m) => [m.goal_id, m]));
  return dataOk((goals ?? []).map((goal) => ({ goal, milestone: byGoal.get(goal.id) ?? null })));
}

/**
 * Creates a goal in the first free position. Position is assigned server-read rather than
 * client-supplied so two devices adding "goal 3" cannot both claim slot 3 by accident --
 * the same reasoning startHour uses for hour_index.
 */
export async function createGoal(
  client: TypedSupabaseClient,
  userId: string,
  input: CreateGoalInput,
): Promise<DataResult<GoalRow>> {
  const title = input.title.trim();
  if (title.length === 0) return dataErr({ code: 'validation', message: 'A goal needs a title.' });

  const { data: existing, error: listError } = await client
    .from('goals')
    .select('position')
    .eq('user_id', userId)
    .eq('active', true);
  if (listError) return dataErr(mapDataError(listError));

  const taken = new Set((existing ?? []).map((g) => g.position));
  if (taken.size >= MAX_ACTIVE_GOALS) {
    return dataErr({
      code: 'validation',
      message: 'Five goals is the ceiling, on purpose. Retire one before adding another.',
    });
  }
  const position = ([1, 2, 3, 4, 5] as const).find((p) => !taken.has(p));
  if (position == null) {
    return dataErr({ code: 'validation', message: 'No free goal slot.' });
  }

  const { data, error } = await client
    .from('goals')
    .insert({
      user_id: userId,
      title,
      position,
      ...(input.number != null && input.number.trim() !== '' ? { number: input.number.trim() } : {}),
      ...(input.deadline != null ? { deadline: input.deadline } : {}),
      ...(input.reason != null && input.reason.trim() !== '' ? { reason: input.reason.trim() } : {}),
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Retires a goal. Its milestones stay -- history is history. */
export async function retireGoal(
  client: TypedSupabaseClient,
  userId: string,
  goalId: number,
): Promise<DataResult<GoalRow>> {
  const { data, error } = await client
    .from('goals')
    .update({ active: false })
    .eq('id', goalId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/**
 * Sets (or replaces) a goal's milestone for one month. Upsert on (goal_id, month): the
 * unique constraint is the Lite discipline -- one milestone per goal per month -- so
 * re-setting replaces rather than accumulating.
 */
export async function setMilestone(
  client: TypedSupabaseClient,
  userId: string,
  goalId: number,
  month: string,
  title: string,
): Promise<DataResult<MilestoneRow>> {
  const trimmed = title.trim();
  if (trimmed.length === 0) return dataErr({ code: 'validation', message: 'A milestone needs a title.' });

  const { data, error } = await client
    .from('milestones')
    .upsert(
      { user_id: userId, goal_id: goalId, month, title: trimmed },
      { onConflict: 'goal_id,month' },
    )
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function setMilestoneDone(
  client: TypedSupabaseClient,
  userId: string,
  milestoneId: number,
  done: boolean,
): Promise<DataResult<MilestoneRow>> {
  const { data, error } = await client
    .from('milestones')
    .update({ done })
    .eq('id', milestoneId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
