import {
  generateAndPersistWeeklyPlan,
  updateWeeklyPlanBlockStatus as apiUpdateWeeklyPlanBlockStatus,
  type WeeklyPlanBlockStatus,
} from "@collegeos/api";
import type { LocalDate } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

export interface CalendarActionResult {
  ok: boolean;
  error?: string;
}

/** No server-action layer on mobile -- calls packages/api directly against the native
 *  client, same convention as todayActions.ts. Never forces: a prior plan with adjustments
 *  gets the same refusal generateAndPersistWeeklyPlan already gives everywhere else. */
export async function generateThisWeekPlan(userId: string, weekStartDate: LocalDate, today: LocalDate): Promise<CalendarActionResult> {
  const client = getMobileSupabaseClient();
  const result = await generateAndPersistWeeklyPlan(client, userId, weekStartDate, today);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function updateWeeklyPlanBlockStatus(userId: string, blockId: number, status: WeeklyPlanBlockStatus): Promise<CalendarActionResult> {
  const client = getMobileSupabaseClient();
  const result = await apiUpdateWeeklyPlanBlockStatus(client, userId, blockId, status);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
