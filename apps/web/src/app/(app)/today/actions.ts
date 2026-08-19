"use server";

import { revalidatePath } from "next/cache";
import {
  logKillEvent,
  startFocusSession,
  submitMorningCheckin,
  updateTaskStatus,
  type KillEventOutcome,
  type SubmitMorningCheckinInput,
  type TaskStatus,
} from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface ToggleTaskResult {
  ok: boolean;
  error?: string;
}

/** RLS scopes this to the caller's own tasks — no explicit ownership check needed here. */
export async function toggleTaskCompletion(taskId: number, nextStatus: TaskStatus): Promise<ToggleTaskResult> {
  const client = await getServerSupabaseClient();
  const result = await updateTaskStatus(client, taskId, nextStatus);
  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true };
}

export interface SubmitCheckinResult {
  ok: boolean;
  error?: string;
}

export async function submitCheckin(
  input: Omit<SubmitMorningCheckinInput, "userId">,
): Promise<SubmitCheckinResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const result = await submitMorningCheckin(client, { ...input, userId: user.id });
  if (!result.ok) return { ok: false, error: result.error.message };

  revalidatePath("/today");
  return { ok: true };
}

export interface LogKillEventResult {
  ok: boolean;
  error?: string;
}

/** One tap, nothing to type — "outcome" is which of the two buttons was pressed.
 *  Fires immediately, no confirmation step, matching the five-second bar. */
export async function logKillEventForHabit(killHabitId: number, outcome: KillEventOutcome): Promise<LogKillEventResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const result = await logKillEvent(client, user.id, { killHabitId, outcome });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export interface StartFocusResult {
  ok: boolean;
  sessionId?: number;
  error?: string;
}

/** Starts a session against the pre-selected highest-value block and hands back its id
 *  so the caller can navigate straight to /focus/[sessionId] — no intermediate form. */
export async function startFocus(taskId: number, plannedDurationMin: number, location?: string): Promise<StartFocusResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const result = await startFocusSession(client, user.id, {
    taskId,
    plannedDurationMin,
    ...(location != null ? { location } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, sessionId: result.data.id };
}
