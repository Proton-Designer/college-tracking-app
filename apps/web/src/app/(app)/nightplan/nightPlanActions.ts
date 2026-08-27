"use server";

import { revalidatePath } from "next/cache";
import {
  getOwnProfile,
  getUserLocalToday,
  saveNightPlan,
  type NightPlanItem,
} from "@collegeos/api";
import { addDays } from "@collegeos/core";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface NightPlanActionResult {
  ok: boolean;
  error?: string;
  data?: { created: number; plannedDate: string };
}

/**
 * Writes tomorrow's plan.
 *
 * "Tomorrow" is derived from the user's local today, not from the server clock and not
 * from the browser — someone planning at 00:30 is still planning for the day they think of
 * as tomorrow, and a UTC-derived boundary would silently file it a day out (B4).
 *
 * Items are created through the normal task path, so a planned task is indistinguishable
 * from one typed on Today and inherits the same RLS. The ranks (1 = the crowned MIT, 2 and
 * 3 the other starred items) are validated in the data layer, not here.
 */
export async function saveNightPlanAction(items: NightPlanItem[]): Promise<NightPlanActionResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };

  const today = getUserLocalToday(profileResult.data.timezone, new Date());
  const plannedDate = addDays(today, 1);

  const result = await saveNightPlan(client, user.id, plannedDate, items);
  if (!result.ok) return { ok: false, error: result.error.message };

  revalidatePath("/nightplan");
  revalidatePath("/today");
  return { ok: true, data: { created: result.data.created.length, plannedDate } };
}
