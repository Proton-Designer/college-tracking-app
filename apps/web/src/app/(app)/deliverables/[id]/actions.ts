"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireUserId(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  return { ok: true, userId: user.id };
}

export interface UpdateDeliverableFormInput {
  title?: string;
  type?: DeliverableType;
  /** Local calendar date -- converted server-side, same reasoning as courses/[id]'s
   *  createDeliverableAction. */
  dueDate?: LocalDate;
  estimatedMinutes?: number | null;
  status?: UpdateDeliverableInput['status'];
}

export async function updateDeliverableAction(deliverableId: number, input: UpdateDeliverableFormInput): Promise<ActionResult> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  const client = await getServerSupabaseClient();

  let dueAt: string | undefined;
  if (input.dueDate !== undefined) {
    const profileResult = await getOwnProfile(client);
    if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
    dueAt = localTimeToInstant(input.dueDate, 23, 59, profileResult.data.timezone);
  }

  const result = await updateDeliverable(client, auth.userId, deliverableId, {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.type !== undefined ? { type: input.type } : {}),
    ...(dueAt !== undefined ? { dueAt } : {}),
    ...(input.estimatedMinutes !== undefined ? { estimatedMinutes: input.estimatedMinutes } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath(`/deliverables/${deliverableId}`);
  revalidatePath(`/courses/${result.data.course_id}`);
  return { ok: true };
}

export async function deleteDeliverableAction(deliverableId: number, courseId: number): Promise<ActionResult> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  const client = await getServerSupabaseClient();
  const result = await deleteDeliverable(client, auth.userId, deliverableId);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath(`/courses/${courseId}`);
  redirect(`/courses/${courseId}`);
}

export type GenerateBackplanActionResult = { ok: true } | { ok: false; error: string; conflict?: boolean };

export async function generateBackplanAction(deliverableId: number, force: boolean): Promise<GenerateBackplanActionResult> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  const client = await getServerSupabaseClient();
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };

  const today = getUserLocalToday(profileResult.data.timezone, new Date());
  const result = await generateAndPersistBackplan(client, auth.userId, deliverableId, today, { force });
  if (!result.ok) return { ok: false, error: result.error.message, conflict: result.error.code === 'conflict' };
  revalidatePath(`/deliverables/${deliverableId}`);
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

export async function addDeliverableTaskAction(input: AddDeliverableTaskInput): Promise<ActionResult> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  const client = await getServerSupabaseClient();
  const result = await createTask(client, {
    user_id: auth.userId,
    deliverable_id: input.deliverableId,
    course_id: input.courseId,
    title: input.title,
    category: input.category,
    planned_date: input.plannedDate,
    ...(input.estimatedMinutes != null ? { estimated_minutes: input.estimatedMinutes } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath(`/deliverables/${input.deliverableId}`);
  revalidatePath("/today");
  return { ok: true };
}

export interface SetTaskProofOfWorkInput {
  taskId: number;
  deliverableId: number;
  requiresProofOfWork: boolean;
  proofOfWorkType?: TaskProofOfWorkType | null;
}

export async function setTaskProofOfWorkAction(input: SetTaskProofOfWorkInput): Promise<ActionResult> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  const client = await getServerSupabaseClient();
  const result = await updateTask(client, auth.userId, input.taskId, {
    requiresProofOfWork: input.requiresProofOfWork,
    ...(input.proofOfWorkType !== undefined ? { proofOfWorkType: input.proofOfWorkType } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath(`/deliverables/${input.deliverableId}`);
  return { ok: true };
}
