"use server";

import { revalidatePath } from "next/cache";
import {
  generateAndPersistWeeklyPlan,
  getOwnProfile,
  getUserLocalToday,
  updateWeeklyPlanBlockStatus,
  type WeeklyPlanBlockStatus,
} from "@collegeos/api";
import { startOfWeek } from "@collegeos/core";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireUserId(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  return { ok: true, userId: user.id };
}

/** Generates this week's plan -- the empty state's action, not a description of the gap.
 *  Never forces: if a prior plan for this week has adjustments, the user regenerating
 *  by mistake should get the same refusal generateAndPersistWeeklyPlan already gives
 *  everywhere else, not a silent overwrite. */
export async function generateThisWeekPlanAction(): Promise<ActionResult> {
  const caller = await requireUserId();
  if (!caller.ok) return caller;
  const client = await getServerSupabaseClient();
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const today = getUserLocalToday(profileResult.data.timezone, new Date());
  const weekStartDate = startOfWeek(today);

  const result = await generateAndPersistWeeklyPlan(client, caller.userId, weekStartDate, today);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/calendar");
  return { ok: true };
}

export async function updateWeeklyPlanBlockStatusAction(blockId: number, status: WeeklyPlanBlockStatus): Promise<ActionResult> {
  const caller = await requireUserId();
  if (!caller.ok) return caller;
  const client = await getServerSupabaseClient();
  const result = await updateWeeklyPlanBlockStatus(client, caller.userId, blockId, status);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/calendar");
  return { ok: true };
}
