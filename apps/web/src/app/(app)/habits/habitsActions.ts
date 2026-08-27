"use server";

import { revalidatePath } from "next/cache";
import { createHabit, getOwnProfile, getUserLocalToday, setHabitVote, updateHabit } from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface HabitsActionResult {
  ok: boolean;
  error?: string;
}

async function requireUser() {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  return { ok: true as const, client, userId: user.id };
}

/** Casts today's vote. Tapping an already-cast vote retracts it (sets done:false) --
 *  silence and "no" are different answers, so this never deletes the row. */
export async function voteAction(habitId: number, done: boolean): Promise<HabitsActionResult> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const profileResult = await getOwnProfile(caller.client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const today = getUserLocalToday(profileResult.data.timezone, new Date());

  const result = await setHabitVote(caller.client, caller.userId, habitId, today, done);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/habits");
  return { ok: true };
}

export async function addHabitAction(name: string, identity: string): Promise<HabitsActionResult> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await createHabit(caller.client, caller.userId, { name, identity });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/habits");
  return { ok: true };
}

export async function setHabitPausedAction(habitId: number, paused: boolean): Promise<HabitsActionResult> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await updateHabit(caller.client, caller.userId, habitId, { paused });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/habits");
  return { ok: true };
}
