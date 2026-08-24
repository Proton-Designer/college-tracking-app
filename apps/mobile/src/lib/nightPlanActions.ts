import {
  getOwnProfile,
  getUserLocalToday,
  listSchoolTodayItems,
  saveNightPlan,
  type NightPlanItem,
} from "@collegeos/api";
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

/**
 * School Today -> the dump (BLUEPRINT 5.5, D24). Pre-loads tomorrow's school items so the
 * Night Plan starts from what the risk engine already knows. The user still stars and
 * crowns; nothing here is auto-planned.
 */
export async function loadSchoolTodayForDump(
  userId: string,
): Promise<{ ok: true; data: { deliverableId: number; text: string }[] } | { ok: false; error: string }> {
  const client = getMobileSupabaseClient();
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const today = getUserLocalToday(profileResult.data.timezone, new Date());

  const result = await listSchoolTodayItems(
    client,
    userId,
    today,
    profileResult.data.timezone,
    profileResult.data.sleep_baseline_hours,
  );
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data.map((i) => ({ deliverableId: i.deliverableId, text: i.text })) };
}
