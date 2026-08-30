"use server";

import { revalidatePath } from "next/cache";
import {
  clearGoalPairMark,
  clearGoalPriorityScores,
  createGoal,
  markGoalPair,
  retireGoal,
  setGoalPriorityScores,
  setMilestone,
  setMilestoneDone,
  type GoalPriorityScoreRow,
  type GoalRelationshipRow,
  type GoalRow,
  type MilestoneRow,
} from "@collegeos/api";
import type { GoalRelationship } from "@collegeos/core";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface GoalsActionResult<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function requireUser() {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  return { ok: true as const, client, userId: user.id };
}

/** Creates a goal in the first free position -- position is server-assigned (see
 *  createGoal's own comment), never client-supplied. */
export async function addGoalAction(input: {
  title: string;
  number?: string;
  deadline?: string;
  reason?: string;
}): Promise<GoalsActionResult<GoalRow>> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await createGoal(caller.client, caller.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/goals");
  return { ok: true, data: result.data };
}

/** Retires a goal -- its milestones stay, history is history. */
export async function retireGoalAction(goalId: number): Promise<GoalsActionResult<GoalRow>> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await retireGoal(caller.client, caller.userId, goalId);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/goals");
  return { ok: true, data: result.data };
}

/** Sets (or replaces) this month's milestone for one goal. */
export async function setMilestoneAction(goalId: number, month: string, title: string): Promise<GoalsActionResult<MilestoneRow>> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await setMilestone(caller.client, caller.userId, goalId, month, title);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/goals");
  return { ok: true, data: result.data };
}

export async function toggleMilestoneDoneAction(milestoneId: number, done: boolean): Promise<GoalsActionResult<MilestoneRow>> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await setMilestoneDone(caller.client, caller.userId, milestoneId, done);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/goals");
  return { ok: true, data: result.data };
}

// ---------------------------------------------------------------------------
// Goal Ecology (D49)
// ---------------------------------------------------------------------------

/**
 * Marks one pair competing / neutral / synergistic, with the user's own note.
 *
 * There is deliberately no action here that acts ON a competing pair — no "resolve", no
 * "eliminate", no "which one wins". The app's job is to make the tension visible; the
 * trade-off is the user's to make, in their life, not in a form.
 */
export async function markGoalPairAction(input: {
  goalAId: number;
  goalBId: number;
  relationship: GoalRelationship;
  note?: string | null;
}): Promise<GoalsActionResult<GoalRelationshipRow>> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await markGoalPair(caller.client, caller.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/goals");
  return { ok: true, data: result.data };
}

/**
 * Takes a pair's mark off, returning it to UNMARKED.
 *
 * Not "setting it to neutral" — unmarked is the question going back to being unasked, and the
 * examined share falls accordingly (D49). Without this the first tap would be irreversible.
 */
export async function unmarkGoalPairAction(
  goalAId: number,
  goalBId: number,
): Promise<GoalsActionResult<null>> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await clearGoalPairMark(caller.client, caller.userId, goalAId, goalBId);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/goals");
  return { ok: true, data: null };
}

/** Writes all four Priority Matrix scores for one goal. Optional, and all four at once — a
 *  composite over a half-filled matrix would be a number derived from an unfinished answer. */
export async function setGoalPriorityScoresAction(input: {
  goalId: number;
  visionAlignment: number;
  leverage: number;
  compoundBenefit: number;
  opportunityCost: number;
  scoredOn: string;
}): Promise<GoalsActionResult<GoalPriorityScoreRow>> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await setGoalPriorityScores(caller.client, caller.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/goals");
  return { ok: true, data: result.data };
}

/** Clears a goal's scores. Optional has to include un-doing it; the goal shows no composite
 *  again and does not fall to the bottom of anything, because nothing here ranks by composite. */
export async function clearGoalPriorityScoresAction(goalId: number): Promise<GoalsActionResult<null>> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await clearGoalPriorityScores(caller.client, caller.userId, goalId);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/goals");
  return { ok: true, data: null };
}
