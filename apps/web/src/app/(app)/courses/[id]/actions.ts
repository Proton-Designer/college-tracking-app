"use server";

import { revalidatePath } from "next/cache";
import {
  computeCourseGradeScenario,
  computeCourseRequiredScore,
  createDeliverable,
  createGradeCategory,
  deleteGradeBoundary,
  deleteGradeCategory,
  getOwnProfile,
  updateCourse,
  updateGradeCategory,
  upsertGradeBoundary,
  type CreateGradeCategoryInput,
  type DeliverableType,
  type UpdateCourseInput,
  type UpdateGradeCategoryInput,
  type UpsertGradeBoundaryInput,
} from "@collegeos/api";
import { localTimeToInstant, type CourseGradeResult, type GradeScenarioHypothetical, type LocalDate, type RequiredScoreResult } from "@collegeos/core";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export type ScenarioResult = { ok: true; data: CourseGradeResult } | { ok: false; error: string };
export type RequiredScoreCalcResult = { ok: true; data: RequiredScoreResult } | { ok: false; error: string };

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

export async function updateCourseAction(courseId: number, input: UpdateCourseInput): Promise<ActionResult> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  const client = await getServerSupabaseClient();
  const result = await updateCourse(client, auth.userId, courseId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath(`/courses/${courseId}`);
  revalidatePath("/courses");
  return { ok: true };
}

export async function createGradeCategoryAction(input: CreateGradeCategoryInput): Promise<ActionResult> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  const client = await getServerSupabaseClient();
  const result = await createGradeCategory(client, auth.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath(`/courses/${input.courseId}`);
  return { ok: true };
}

export async function updateGradeCategoryAction(
  courseId: number,
  categoryId: number,
  input: UpdateGradeCategoryInput,
): Promise<ActionResult> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  const client = await getServerSupabaseClient();
  const result = await updateGradeCategory(client, auth.userId, categoryId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath(`/courses/${courseId}`);
  return { ok: true };
}

export async function deleteGradeCategoryAction(courseId: number, categoryId: number): Promise<ActionResult> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  const client = await getServerSupabaseClient();
  const result = await deleteGradeCategory(client, auth.userId, categoryId);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath(`/courses/${courseId}`);
  return { ok: true };
}

export async function upsertGradeBoundaryAction(input: UpsertGradeBoundaryInput): Promise<ActionResult> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  const client = await getServerSupabaseClient();
  const result = await upsertGradeBoundary(client, auth.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath(`/courses/${input.courseId}`);
  return { ok: true };
}

export async function deleteGradeBoundaryAction(courseId: number, boundaryId: number): Promise<ActionResult> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  const client = await getServerSupabaseClient();
  const result = await deleteGradeBoundary(client, auth.userId, boundaryId);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath(`/courses/${courseId}`);
  return { ok: true };
}

export interface CreateDeliverableFormInput {
  courseId: number;
  title: string;
  type: DeliverableType;
  /** Local calendar date from the DatePicker -- converted to a real instant server-side
   *  using the user's own profile timezone, never a client-side UTC guess (never derive
   *  a day boundary from UTC). Due at the end of that local day. */
  dueDate: LocalDate;
  estimatedMinutes?: number;
}

export async function createDeliverableAction(input: CreateDeliverableFormInput): Promise<ActionResult> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  const client = await getServerSupabaseClient();
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };

  const dueAt = localTimeToInstant(input.dueDate, 23, 59, profileResult.data.timezone);
  const result = await createDeliverable(client, auth.userId, {
    courseId: input.courseId,
    title: input.title,
    type: input.type,
    dueAt,
    ...(input.estimatedMinutes != null ? { estimatedMinutes: input.estimatedMinutes } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath(`/courses/${input.courseId}`);
  revalidatePath("/courses");
  revalidatePath("/today");
  return { ok: true };
}

export async function runGradeScenario(
  courseId: number,
  hypotheticals: GradeScenarioHypothetical[],
): Promise<ScenarioResult> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;

  const client = await getServerSupabaseClient();
  const result = await computeCourseGradeScenario(client, auth.userId, courseId, hypotheticals);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export async function runRequiredScore(courseId: number, targetPct: number): Promise<RequiredScoreCalcResult> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;

  const client = await getServerSupabaseClient();
  const result = await computeCourseRequiredScore(client, auth.userId, courseId, targetPct);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}
