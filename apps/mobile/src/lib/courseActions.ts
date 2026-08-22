import {
  computeCourseGradeScenario,
  computeCourseRequiredScore,
  createCourse,
  createDeliverable,
  createGradeCategory,
  deleteGradeBoundary,
  deleteGradeCategory,
  getOwnProfile,
  updateCourse,
  updateGradeCategory,
  upsertGradeBoundary,
  type CourseInsert,
  type CreateGradeCategoryInput,
  type DeliverableType,
  type UpdateCourseInput,
  type UpdateGradeCategoryInput,
  type UpsertGradeBoundaryInput,
} from "@collegeos/api";
import { localTimeToInstant, type CourseGradeResult, type GradeScenarioHypothetical, type LocalDate, type RequiredScoreResult } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

export type ScenarioResult = { ok: true; data: CourseGradeResult } | { ok: false; error: string };
export type RequiredScoreCalcResult = { ok: true; data: RequiredScoreResult } | { ok: false; error: string };

export interface ActionResult {
  ok: boolean;
  error?: string;
}

export interface CreateCourseInput {
  code: string;
  name: string;
  term: string;
}

export type CreateCourseActionResult = { ok: true; courseId: number } | { ok: false; error: string };

/** Mirrors apps/web/src/app/(app)/courses/actions.ts's createCourseAction -- no server-action
 *  layer on mobile, so this calls packages/api directly against the native client. */
export async function createCourseAction(userId: string, input: CreateCourseInput): Promise<CreateCourseActionResult> {
  const client = getMobileSupabaseClient();
  const insert: CourseInsert = { user_id: userId, code: input.code, name: input.name, term: input.term };
  const result = await createCourse(client, insert);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, courseId: result.data.id };
}

export async function runGradeScenario(
  userId: string,
  courseId: number,
  hypotheticals: GradeScenarioHypothetical[],
): Promise<ScenarioResult> {
  const client = getMobileSupabaseClient();
  const result = await computeCourseGradeScenario(client, userId, courseId, hypotheticals);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export async function runRequiredScore(userId: string, courseId: number, targetPct: number): Promise<RequiredScoreCalcResult> {
  const client = getMobileSupabaseClient();
  const result = await computeCourseRequiredScore(client, userId, courseId, targetPct);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

/** Mirrors apps/web's courses/[id]/actions.ts 1:1 from here down -- no server-action layer
 *  on mobile, so each of these calls packages/api directly against the native client and
 *  the caller refetches its own hook instead of a revalidatePath. */
export async function updateCourseAction(userId: string, courseId: number, input: UpdateCourseInput): Promise<ActionResult> {
  const client = getMobileSupabaseClient();
  const result = await updateCourse(client, userId, courseId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function createGradeCategoryAction(userId: string, input: CreateGradeCategoryInput): Promise<ActionResult> {
  const client = getMobileSupabaseClient();
  const result = await createGradeCategory(client, userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function updateGradeCategoryAction(
  userId: string,
  categoryId: number,
  input: UpdateGradeCategoryInput,
): Promise<ActionResult> {
  const client = getMobileSupabaseClient();
  const result = await updateGradeCategory(client, userId, categoryId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function deleteGradeCategoryAction(userId: string, categoryId: number): Promise<ActionResult> {
  const client = getMobileSupabaseClient();
  const result = await deleteGradeCategory(client, userId, categoryId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function upsertGradeBoundaryAction(userId: string, input: UpsertGradeBoundaryInput): Promise<ActionResult> {
  const client = getMobileSupabaseClient();
  const result = await upsertGradeBoundary(client, userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function deleteGradeBoundaryAction(userId: string, boundaryId: number): Promise<ActionResult> {
  const client = getMobileSupabaseClient();
  const result = await deleteGradeBoundary(client, userId, boundaryId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export interface CreateDeliverableFormInput {
  courseId: number;
  title: string;
  type: DeliverableType;
  /** Local calendar date from the DatePicker -- converted to a real instant here using the
   *  user's own profile timezone, never a client-side UTC guess. Due at the end of that
   *  local day. */
  dueDate: LocalDate;
  estimatedMinutes?: number;
}

export async function createDeliverableAction(userId: string, input: CreateDeliverableFormInput): Promise<ActionResult> {
  const client = getMobileSupabaseClient();
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };

  const dueAt = localTimeToInstant(input.dueDate, 23, 59, profileResult.data.timezone);
  const result = await createDeliverable(client, userId, {
    courseId: input.courseId,
    title: input.title,
    type: input.type,
    dueAt,
    ...(input.estimatedMinutes != null ? { estimatedMinutes: input.estimatedMinutes } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
