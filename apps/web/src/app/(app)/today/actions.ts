"use server";

import { revalidatePath } from "next/cache";
import {
  createTask,
  getOwnProfile,
  logKillEvent,
  startFocusSession,
  submitMorningCheckin,
  updateTaskStatus,
  type KillEventOutcome,
  type SubmitMorningCheckinInput,
  type TaskStatus,
} from "@collegeos/api";
import { localTimeToInstant, type LocalDate } from "@collegeos/core";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface AddTaskResult {
  ok: boolean;
  error?: string;
}

export interface AddTaskInput {
  title: string;
  category: string;
  plannedDate: LocalDate;
  courseId?: number;
  estimatedMinutes?: number;
  /** Local wall-clock "HH:MM" -- resolved against the profile timezone server-side
   *  (never the server's own clock; B4's rule). Voice capture supplies this. */
  startTime?: string;
}

/** E0/U6: Today's own quick-add -- the only entry point for a task that isn't scoped to
 *  a specific deliverable (that scoped version lives on /deliverables/[id]). courseId is
 *  optional -- a personal task (gym, errand) is real and plannable without belonging to
 *  any course, same as course_id already being nullable on the tasks table. */
export async function addTaskAction(input: AddTaskInput): Promise<AddTaskResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  let plannedStartAt: string | null = null;
  if (input.startTime != null && /^\d{2}:\d{2}$/.test(input.startTime)) {
    const profileResult = await getOwnProfile(client);
    if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
    const [h, m] = input.startTime.split(":").map(Number);
    plannedStartAt = localTimeToInstant(input.plannedDate, h!, m!, profileResult.data.timezone);
  }

  const result = await createTask(client, {
    user_id: user.id,
    title: input.title,
    category: input.category,
    planned_date: input.plannedDate,
    ...(input.courseId != null ? { course_id: input.courseId } : {}),
    ...(input.estimatedMinutes != null ? { estimated_minutes: input.estimatedMinutes } : {}),
    ...(plannedStartAt != null ? { planned_start_at: plannedStartAt } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/today");
  return { ok: true };
}

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
