import {
  createTask,
  deleteDeliverable,
  generateAndPersistBackplan,
  getOwnProfile,
  getUserLocalToday,
  updateDeliverable,
  updateTask,
  type DeliverableType,
  type TaskProofOfWorkType,
  type UpdateDeliverableInput,
} from "@collegeos/api";
import { localTimeToInstant, type LocalDate } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Mirrors apps/web's deliverables/[id]/actions.ts 1:1 -- no server-action layer on mobile,
 *  so each of these calls packages/api directly against the native client. */
export interface UpdateDeliverableFormInput {
  title?: string;
  type?: DeliverableType;
  dueDate?: LocalDate;
  estimatedMinutes?: number | null;
  status?: UpdateDeliverableInput["status"];
}

export async function updateDeliverableAction(
  userId: string,
  deliverableId: number,
  input: UpdateDeliverableFormInput,
): Promise<ActionResult> {
  const client = getMobileSupabaseClient();

  let dueAt: string | undefined;
  if (input.dueDate !== undefined) {
    const profileResult = await getOwnProfile(client);
    if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
    dueAt = localTimeToInstant(input.dueDate, 23, 59, profileResult.data.timezone);
  }

  const result = await updateDeliverable(client, userId, deliverableId, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(dueAt !== undefined ? { dueAt } : {}),
    ...(input.estimatedMinutes !== undefined ? { estimatedMinutes: input.estimatedMinutes } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function deleteDeliverableAction(userId: string, deliverableId: number): Promise<ActionResult> {
  const client = getMobileSupabaseClient();
  const result = await deleteDeliverable(client, userId, deliverableId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export type GenerateBackplanActionResult = { ok: true } | { ok: false; error: string; conflict?: boolean };

export async function generateBackplanAction(userId: string, deliverableId: number, force: boolean): Promise<GenerateBackplanActionResult> {
  const client = getMobileSupabaseClient();
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };

  const today = getUserLocalToday(profileResult.data.timezone, new Date());
  const result = await generateAndPersistBackplan(client, userId, deliverableId, today, { force });
  if (!result.ok) return { ok: false, error: result.error.message, conflict: result.error.code === "conflict" };
  return { ok: true };
}

export interface AddDeliverableTaskInput {
  deliverableId: number;
  courseId: number;
  title: string;
  category: string;
  plannedDate: LocalDate;
  estimatedMinutes?: number;
}

export async function addDeliverableTaskAction(userId: string, input: AddDeliverableTaskInput): Promise<ActionResult> {
  const client = getMobileSupabaseClient();
  const result = await createTask(client, {
    user_id: userId,
    deliverable_id: input.deliverableId,
    course_id: input.courseId,
    title: input.title,
    category: input.category,
    planned_date: input.plannedDate,
    ...(input.estimatedMinutes != null ? { estimated_minutes: input.estimatedMinutes } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export interface SetTaskProofOfWorkInput {
  taskId: number;
  requiresProofOfWork: boolean;
  proofOfWorkType?: TaskProofOfWorkType | null;
}

export async function setTaskProofOfWorkAction(userId: string, input: SetTaskProofOfWorkInput): Promise<ActionResult> {
  const client = getMobileSupabaseClient();
  const result = await updateTask(client, userId, input.taskId, {
    requiresProofOfWork: input.requiresProofOfWork,
    ...(input.proofOfWorkType !== undefined ? { proofOfWorkType: input.proofOfWorkType } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
