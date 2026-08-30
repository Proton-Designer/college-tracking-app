"use server";

import { revalidatePath } from "next/cache";
import {
  getOwnProfile,
  getUserLocalToday,
  setWeeklyGoalCompleted,
  updateTaskStatus,
  upsertWeeklyGoal,
} from "@collegeos/api";
import { startOfWeek } from "@collegeos/core";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Server actions for /business. Mirrored one-for-one by apps/mobile/src/lib/businessActions.ts.
 *
 * **Business is a lens, not a store** (directive rule 3.4), and these actions are the proof:
 * the only table any of them writes that Business could be said to own is `weekly_goals`,
 * which is the shared cadence layer every domain reads. Completing a task goes through
 * `updateTaskStatus` — the same function `/today` uses, against the same `tasks` rows, with
 * the same proof-of-work gate. There is no second task store here and there must not be one.
 *
 * **D37, restated because it is the ruling most easily broken here:** the MIT system IS the
 * kill list. This page reads `tasks.mit_rank` and never maintains a list of its own.
 */

export interface BusinessActionResult {
  ok: boolean;
  error?: string;
}

async function requireCaller() {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const profile = await getOwnProfile(client);
  if (!profile.ok) return { ok: false as const, error: profile.error.message };
  const today = getUserLocalToday(profile.data.timezone, new Date());
  return { ok: true as const, client, userId: user.id, today, weekStart: startOfWeek(today) };
}

/** The week's business headline. An upsert on (user, week, domain) — rewriting the week edits
 *  it, because more than one headline per domain per week is not a focus. */
export async function setWeeklyGoalAction(input: {
  headline: string;
  milestones: string | null;
  goalId: number | null;
}): Promise<BusinessActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await upsertWeeklyGoal(caller.client, caller.userId, {
    weekStart: caller.weekStart,
    domain: "business",
    headline: input.headline,
    milestones: input.milestones,
    goalId: input.goalId,
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/business");
  return { ok: true };
}

/** Closes the week's focus, or reopens it. The Sunday review closes it too (D37); this is the
 *  same one-tap control on the day it actually finishes. */
export async function setWeeklyGoalDoneAction(weeklyGoalId: number, done: boolean): Promise<BusinessActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await setWeeklyGoalCompleted(caller.client, caller.userId, weeklyGoalId, done);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/business");
  return { ok: true };
}

/**
 * Marks a business-tagged task complete, or puts it back to pending.
 *
 * Deliberately the shared `updateTaskStatus`: it carries the proof-of-work gate, so a task
 * that requires evidence still cannot be closed from here just because this page is smaller
 * than /today. The refusal comes back as its own sentence.
 */
export async function setTaskCompletedAction(taskId: number, completed: boolean): Promise<BusinessActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await updateTaskStatus(caller.client, taskId, completed ? "completed" : "pending");
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/business");
  revalidatePath("/today");
  return { ok: true };
}
