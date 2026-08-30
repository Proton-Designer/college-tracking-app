"use server";

import type { LifeDomain } from "@collegeos/core";
import { revalidatePath } from "next/cache";
import {
  abandonFocusSession,
  completeFocusSession,
  getOwnProfile,
  getUserLocalToday,
  logDistraction,
  startHour,
  type DistractionCause,
  type TaskSessionRow,
} from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface HourActionResult<T> {
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

/**
 * Start an Hour. `localDate` is computed server-side from the profile timezone and passed
 * in, never derived from a UTC slice and never taken from the browser — an Hour started at
 * 11pm belongs to the day the user is living in, not to whatever UTC says (B4).
 */
export async function startHourAction(input: {
  deliverable: string;
  category?: string;
  plannedDurationMin?: number;
  /**
   * Which life domain this Hour serves (D27). Defaults to `school` -- the domain every Hour in
   * this app implicitly served before the merge -- so an existing surface that has not yet grown
   * a domain picker keeps working and keeps writing an honest value rather than an untagged row.
   */
  domain?: LifeDomain;
  /** Deep Work or Deep Study. Both count toward the day; the distinction is LifeOS's and real. */
  sessionType?: "deep_work" | "deep_study" | "exam_prep";
}): Promise<HourActionResult<TaskSessionRow>> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const deliverable = input.deliverable.trim();
  if (deliverable.length === 0) {
    return { ok: false, error: "An Hour needs one specific thing it produces." };
  }

  const profileResult = await getOwnProfile(caller.client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const localDate = getUserLocalToday(profileResult.data.timezone, new Date());

  const result = await startHour(caller.client, caller.userId, {
    deliverable,
    localDate,
    domain: input.domain ?? "school",
    ...(input.sessionType != null ? { sessionType: input.sessionType } : {}),
    ...(input.category != null && input.category.length > 0 ? { category: input.category } : {}),
    ...(input.plannedDurationMin != null ? { plannedDurationMin: input.plannedDurationMin } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/hour");
  revalidatePath("/today");
  return { ok: true, data: result.data };
}

/** One distraction, with its cause. The six causes are a DB enum, not free text — the
 *  Pareto in the Sunday Review is only meaningful because the cause set is closed. */
export async function logDistractionAction(
  sessionId: number,
  cause: DistractionCause,
): Promise<HourActionResult<{ count: number }>> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await logDistraction(caller.client, caller.userId, sessionId, cause);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/hour");
  return { ok: true, data: { count: 1 } };
}

/**
 * End the Hour. `completed` puts a tile on the Wall; `abandoned` does not — the Wall is
 * the proof surface and must only ever grow, so an abandoned Hour is absent rather than
 * shown as debt.
 *
 * Duration is not passed: `endFocusSession` server-computes `actual_duration_min` from the
 * stored `actual_start`, so a client that lied about elapsed time (or simply had a clock
 * skew) cannot inflate the Wall.
 */
export async function endHourAction(
  sessionId: number,
  outcome: "completed" | "abandoned",
  detail?: { subjectiveFocus?: number; objectiveOutput?: string },
): Promise<HourActionResult<TaskSessionRow>> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const input = {
    sessionId,
    ...(detail?.subjectiveFocus != null ? { subjectiveFocus: detail.subjectiveFocus } : {}),
    ...(detail?.objectiveOutput != null && detail.objectiveOutput.length > 0
      ? { objectiveOutput: detail.objectiveOutput }
      : {}),
  };

  const result =
    outcome === "completed"
      ? await completeFocusSession(caller.client, caller.userId, input)
      : await abandonFocusSession(caller.client, caller.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/hour");
  revalidatePath("/wall");
  revalidatePath("/today");
  return { ok: true, data: result.data };
}
