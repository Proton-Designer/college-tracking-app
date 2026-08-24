import {
  createGoal,
  getOwnProfile,
  getUserLocalToday,
  listGoalsWithMilestones,
  monthOf,
  retireGoal,
  setMilestone,
  setMilestoneDone,
  type GoalWithMilestone,
} from "@collegeos/api";
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
