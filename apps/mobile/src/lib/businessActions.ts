import {
  getOwnProfile,
  getUserLocalToday,
  loadBusinessLens,
  setWeeklyGoalCompleted,
  updateTaskStatus,
  upsertWeeklyGoal,
  type BusinessLens,
} from "@collegeos/api";
import { startOfWeek, type LocalDate } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

/**
 * Mirrors apps/web/src/app/(app)/business/businessActions.ts one-for-one.
 *
 * **Business is a lens, not a store** (directive rule 3.4), and these functions are the proof:
 * the only table any of them writes that Business could be said to own is `weekly_goals`, the
 * shared cadence layer. Completing a task goes through `updateTaskStatus` — the same function
 * Today uses, against the same rows, with the same proof-of-work gate. There is no second task
 * store here, and D37 means there is no second "today's three" either: the MIT panel reads
 * `tasks.mit_rank`.
 */

export interface BusinessActionResult {
  ok: boolean;
  error?: string;
}

export type BusinessLoadResult = { ok: true; data: BusinessLens } | { ok: false; error: string };

export async function loadBusiness(userId: string): Promise<BusinessLoadResult> {
  const client = getMobileSupabaseClient();
  const result = await loadBusinessLens(client, userId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

async function currentWeekStart(): Promise<{ ok: true; value: LocalDate } | { ok: false; error: string }> {
  const client = getMobileSupabaseClient();
  const profile = await getOwnProfile(client);
  if (!profile.ok) return { ok: false, error: profile.error.message };
  return { ok: true, value: startOfWeek(getUserLocalToday(profile.data.timezone, new Date())) };
}

/** An upsert on (user, week, domain) — rewriting the week edits it, because more than one
 *  headline per domain per week is not a focus. */
export async function setBusinessWeeklyGoal(
  userId: string,
  input: { headline: string; milestones: string | null; goalId: number | null },
): Promise<BusinessActionResult> {
  const week = await currentWeekStart();
  if (!week.ok) return week;
  const client = getMobileSupabaseClient();
  const result = await upsertWeeklyGoal(client, userId, {
    weekStart: week.value,
    domain: "business",
    headline: input.headline,
    milestones: input.milestones,
    goalId: input.goalId,
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function setWeeklyGoalDone(
  userId: string,
  weeklyGoalId: number,
  done: boolean,
): Promise<BusinessActionResult> {
  const client = getMobileSupabaseClient();
  const result = await setWeeklyGoalCompleted(client, userId, weeklyGoalId, done);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** Deliberately the shared `updateTaskStatus`: it carries the proof-of-work gate, so a task
 *  that requires evidence still cannot be closed from here. */
export async function setTaskCompleted(taskId: number, completed: boolean): Promise<BusinessActionResult> {
  const client = getMobileSupabaseClient();
  const result = await updateTaskStatus(client, taskId, completed ? "completed" : "pending");
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
