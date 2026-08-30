import {
  clearGoalPairMark,
  clearGoalPriorityScores,
  createGoal,
  getOwnProfile,
  getUserLocalToday,
  listGoalsWithMilestones,
  loadGoalEcology,
  markGoalPair,
  monthOf,
  retireGoal,
  setGoalPriorityScores,
  setMilestone,
  setMilestoneDone,
  type GoalEcologyView,
  type GoalWithMilestone,
} from "@collegeos/api";
import type { GoalRelationship } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

export type WarMapEntry = GoalWithMilestone;

export interface GoalsActionResult {
  ok: boolean;
  error?: string;
}

/** The month key comes from the user's LOCAL today -- a milestone set at 11 PM on the
 *  31st belongs to the month the user is standing in, not UTC's. */
async function currentMonth(): Promise<{ ok: true; month: string } | { ok: false; error: string }> {
  const profileResult = await getOwnProfile(getMobileSupabaseClient());
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  return { ok: true, month: monthOf(getUserLocalToday(profileResult.data.timezone, new Date())) };
}

export async function loadWarMap(
  userId: string,
): Promise<{ ok: true; data: { month: string; entries: WarMapEntry[] } } | { ok: false; error: string }> {
  const m = await currentMonth();
  if (!m.ok) return { ok: false, error: m.error };
  const result = await listGoalsWithMilestones(getMobileSupabaseClient(), userId, m.month);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: { month: m.month, entries: result.data } };
}

export async function addGoal(
  userId: string,
  input: { title: string; number?: string; reason?: string },
): Promise<GoalsActionResult> {
  const result = await createGoal(getMobileSupabaseClient(), userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function retireGoalAction(userId: string, goalId: number): Promise<GoalsActionResult> {
  const result = await retireGoal(getMobileSupabaseClient(), userId, goalId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function setMilestoneAction(
  userId: string,
  goalId: number,
  title: string,
): Promise<GoalsActionResult> {
  const m = await currentMonth();
  if (!m.ok) return { ok: false, error: m.error };
  const result = await setMilestone(getMobileSupabaseClient(), userId, goalId, m.month, title);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function toggleMilestoneDone(
  userId: string,
  milestoneId: number,
  done: boolean,
): Promise<GoalsActionResult> {
  const result = await setMilestoneDone(getMobileSupabaseClient(), userId, milestoneId, done);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/**
 * Unfinished current-month milestones, formatted for the Night Plan's dump -- the
 * blueprint's "dump pulls from War Map monthly milestones". Same contract as the School
 * Today feed: removable suggestions, never auto-planned.
 */
export async function loadMilestonesForDump(
  userId: string,
): Promise<{ ok: true; data: { text: string }[] } | { ok: false; error: string }> {
  const map = await loadWarMap(userId);
  if (!map.ok) return { ok: false, error: map.error };
  return {
    ok: true,
    data: map.data.entries
      .filter((e) => e.milestone != null && !e.milestone.done)
      .map((e) => ({ text: `${e.goal.title}: ${e.milestone!.title}` })),
  };
}

// ---------------------------------------------------------------------------
// Goal Ecology (D49)
// ---------------------------------------------------------------------------

/** The pairs, the summary and the composites, all decided in `packages/core` — the same call
 *  web's `/goals` makes, so the two platforms cannot disagree about whether a pair is examined. */
export async function loadEcology(
  userId: string,
): Promise<{ ok: true; data: GoalEcologyView } | { ok: false; error: string }> {
  const result = await loadGoalEcology(getMobileSupabaseClient(), userId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

/** Marks one pair. There is no companion action that acts ON a competing pair — no "resolve",
 *  no "eliminate". The app surfaces the tension; the trade-off stays the user's. */
export async function markPair(
  userId: string,
  input: { goalAId: number; goalBId: number; relationship: GoalRelationship; note?: string | null },
): Promise<GoalsActionResult> {
  const result = await markGoalPair(getMobileSupabaseClient(), userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** Back to UNMARKED, not to neutral (D49). Unmarked is the question going back to being unasked,
 *  and the examined share falls with it. */
export async function unmarkPair(
  userId: string,
  goalAId: number,
  goalBId: number,
): Promise<GoalsActionResult> {
  const result = await clearGoalPairMark(getMobileSupabaseClient(), userId, goalAId, goalBId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** All four Priority Matrix scores at once. `scoredOn` is the user's LOCAL today. */
export async function savePriorityScores(
  userId: string,
  input: {
    goalId: number;
    visionAlignment: number;
    leverage: number;
    compoundBenefit: number;
    opportunityCost: number;
  },
): Promise<GoalsActionResult> {
  const profileResult = await getOwnProfile(getMobileSupabaseClient());
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const scoredOn = getUserLocalToday(profileResult.data.timezone, new Date());

  const result = await setGoalPriorityScores(getMobileSupabaseClient(), userId, { ...input, scoredOn });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** Clears a goal's scores — optional has to include un-doing it. */
export async function clearPriorityScores(userId: string, goalId: number): Promise<GoalsActionResult> {
  const result = await clearGoalPriorityScores(getMobileSupabaseClient(), userId, goalId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
