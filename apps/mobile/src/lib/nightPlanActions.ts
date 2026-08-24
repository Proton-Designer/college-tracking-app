import { getOwnProfile, saveNightPlan, type NightPlanItem } from "@collegeos/api";
import type { LocalDate } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

/** Shown in the Night Plan so the batch category is visible, never silently applied. */
export const NIGHT_PLAN_CATEGORY_LABEL = "Admin";

export interface NightPlanActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Saves tomorrow's plan. The date is passed in from the caller, which derived it from the
 * user's own local today via addDays -- never a client-side UTC guess.
 */
export async function saveNightPlanAction(
  userId: string,
  plannedDate: LocalDate,
  items: NightPlanItem[],
): Promise<NightPlanActionResult> {
  const client = getMobileSupabaseClient();
  // Confirms the profile is reachable before writing a batch of tasks; the same guard
  // every other write path in this app runs.
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };

  const result = await saveNightPlan(client, userId, plannedDate, items);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
