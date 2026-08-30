"use server";

import { revalidatePath } from "next/cache";
import {
  createWorkShift,
  createWorkTarget,
  createWorkTargetTask,
  deleteWorkShift,
  getOwnProfile,
  updateWorkTargetStatus,
  updateWorkTargetTaskStatus,
  type WorkTargetStatus,
} from "@collegeos/api";
import type { LocalDate } from "@collegeos/core";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Server actions for /work. Mirrored one-for-one by apps/mobile/src/lib/workActions.ts, which
 * calls the same `@collegeos/api` functions directly -- the same arrangement deenActions uses.
 *
 * Nothing here derives "today": every write in this domain is either dateless (a target's
 * status) or carries an explicit date the user chose (a deadline, a one-off shift), so there is
 * no local-day boundary for a stale page to get wrong.
 */

export interface WorkActionResult {
  ok: boolean;
  error?: string;
}

async function requireCaller() {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  // Not for a date -- this is the same profile-exists check every action file runs, so a
  // caller with a session but no profile row fails with a sentence rather than an FK error.
  const profile = await getOwnProfile(client);
  if (!profile.ok) return { ok: false as const, error: profile.error.message };
  return { ok: true as const, client, userId: user.id };
}

export async function createTargetAction(input: {
  title: string;
  deadline: LocalDate | null;
}): Promise<WorkActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await createWorkTarget(caller.client, caller.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/work");
  return { ok: true };
}

/** Moves a target between lanes. `completed_at` is written from the status inside the data
 *  layer, so no caller can produce the contradiction the DB check forbids. */
export async function setTargetStatusAction(targetId: number, status: WorkTargetStatus): Promise<WorkActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await updateWorkTargetStatus(caller.client, caller.userId, targetId, status);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/work");
  return { ok: true };
}

export async function createTargetTaskAction(input: {
  targetId: number;
  title: string;
  deadline: LocalDate | null;
}): Promise<WorkActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await createWorkTargetTask(caller.client, caller.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/work");
  return { ok: true };
}

export async function setTaskStatusAction(
  taskId: number,
  status: WorkTargetStatus,
  blockedReason: string | null,
): Promise<WorkActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await updateWorkTargetTaskStatus(caller.client, caller.userId, taskId, { status, blockedReason });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/work");
  return { ok: true };
}

/** One of `weekday` / `localDate`, never both and never neither -- the table's XOR. The data
 *  layer explains each of those two mistakes in its own sentence. */
export async function createShiftAction(input: {
  weekday: number | null;
  localDate: LocalDate | null;
  startTime: string;
  endTime: string;
  label: string | null;
}): Promise<WorkActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await createWorkShift(caller.client, caller.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/work");
  return { ok: true };
}

export async function deleteShiftAction(shiftId: number): Promise<WorkActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await deleteWorkShift(caller.client, caller.userId, shiftId);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/work");
  return { ok: true };
}
