"use server";

import { revalidatePath } from "next/cache";
import {
  createGoal,
  retireGoal,
  setMilestone,
  setMilestoneDone,
  type GoalRow,
  type MilestoneRow,
} from "@collegeos/api";
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
