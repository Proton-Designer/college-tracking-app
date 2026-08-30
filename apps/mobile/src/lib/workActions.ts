import {
  createWorkShift,
  createWorkTarget,
  createWorkTargetTask,
  deleteWorkShift,
  loadWorkOverview,
  updateWorkTargetStatus,
  updateWorkTargetTaskStatus,
  type WorkOverview,
  type WorkTargetStatus,
} from "@collegeos/api";
import type { LocalDate } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

/**
 * Mirrors apps/web/src/app/(app)/work/workActions.ts one-for-one.
 *
 * Nothing here derives "today": every write in this domain is either dateless (a target's
 * status) or carries an explicit date the user chose (a deadline, a one-off shift), so there is
 * no local-day boundary for a screen left open across midnight to get wrong.
 */

export interface WorkActionResult {
  ok: boolean;
  error?: string;
}

export type WorkLoadResult = { ok: true; data: WorkOverview } | { ok: false; error: string };

export async function loadWork(userId: string): Promise<WorkLoadResult> {
  const client = getMobileSupabaseClient();
  const result = await loadWorkOverview(client, userId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export async function addTarget(
  userId: string,
  input: { title: string; deadline: LocalDate | null },
): Promise<WorkActionResult> {
  const client = getMobileSupabaseClient();
  const result = await createWorkTarget(client, userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** `completed_at` is written from the status inside the data layer, so no caller can produce
 *  the contradiction the DB check forbids. */
export async function setTargetStatus(
  userId: string,
  targetId: number,
  status: WorkTargetStatus,
): Promise<WorkActionResult> {
  const client = getMobileSupabaseClient();
  const result = await updateWorkTargetStatus(client, userId, targetId, status);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function addTargetTask(
  userId: string,
  input: { targetId: number; title: string; deadline: LocalDate | null },
): Promise<WorkActionResult> {
  const client = getMobileSupabaseClient();
  const result = await createWorkTargetTask(client, userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function setTaskStatus(
  userId: string,
  taskId: number,
  status: WorkTargetStatus,
  blockedReason: string | null,
): Promise<WorkActionResult> {
  const client = getMobileSupabaseClient();
  const result = await updateWorkTargetTaskStatus(client, userId, taskId, { status, blockedReason });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** One of `weekday` / `localDate`, never both and never neither -- the table's XOR. */
export async function addShift(
  userId: string,
  input: {
    weekday: number | null;
    localDate: LocalDate | null;
    startTime: string;
    endTime: string;
    label: string | null;
  },
): Promise<WorkActionResult> {
  const client = getMobileSupabaseClient();
  const result = await createWorkShift(client, userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function removeShift(userId: string, shiftId: number): Promise<WorkActionResult> {
  const client = getMobileSupabaseClient();
  const result = await deleteWorkShift(client, userId, shiftId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
