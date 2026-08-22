import {
  createTask,
  logKillEvent,
  startFocusSession,
  submitMorningCheckin,
  updateTaskStatus,
  type KillEventOutcome,
  type SubmitMorningCheckinInput,
  type TaskStatus,
} from "@collegeos/api";
import type { LocalDate } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

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
}

/** E0/U6: Today's own quick-add -- the only entry point for a task that isn't scoped to
 *  a deliverable already. courseId is optional -- a personal task (gym, errand) is real
 *  and plannable without belonging to any course. Mirrors apps/web/src/app/(app)/today/
 *  actions.ts's addTaskAction; no server-action layer on mobile. */
export async function addTaskAction(userId: string, input: AddTaskInput): Promise<AddTaskResult> {
  const client = getMobileSupabaseClient();
  const result = await createTask(client, {
    user_id: userId,
    title: input.title,
    category: input.category,
    planned_date: input.plannedDate,
    ...(input.courseId != null ? { course_id: input.courseId } : {}),
    ...(input.estimatedMinutes != null ? { estimated_minutes: input.estimatedMinutes } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export interface ToggleTaskResult {
  ok: boolean;
  error?: string;
}

/** RLS scopes this to the caller's own tasks — no explicit ownership check needed here.
 *  Mirrors apps/web/src/app/today/actions.ts's toggleTaskCompletion; there's no server-action
 *  layer on mobile, so this calls packages/api directly against the native client. */
export async function toggleTaskCompletion(taskId: number, nextStatus: TaskStatus): Promise<ToggleTaskResult> {
  const client = getMobileSupabaseClient();
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

export async function submitCheckin(input: SubmitMorningCheckinInput): Promise<SubmitCheckinResult> {
  const client = getMobileSupabaseClient();
  const result = await submitMorningCheckin(client, input);
  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true };
}

export interface LogKillEventResult {
  ok: boolean;
  error?: string;
}

/** One tap, nothing to type — "outcome" is which of the two buttons was pressed. */
export async function logKillEventForHabit(userId: string, killHabitId: number, outcome: KillEventOutcome): Promise<LogKillEventResult> {
  const client = getMobileSupabaseClient();
  const result = await logKillEvent(client, userId, { killHabitId, outcome });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export interface StartFocusResult {
  ok: boolean;
  sessionId?: number;
  error?: string;
}

export async function startFocus(
  userId: string,
  taskId: number,
  plannedDurationMin: number,
  location?: string,
): Promise<StartFocusResult> {
  const client = getMobileSupabaseClient();
  const result = await startFocusSession(client, userId, {
    taskId,
    plannedDurationMin,
    ...(location != null ? { location } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, sessionId: result.data.id };
}
