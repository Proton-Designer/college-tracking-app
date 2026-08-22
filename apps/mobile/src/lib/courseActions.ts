import { computeCourseGradeScenario, computeCourseRequiredScore, createCourse, type CourseInsert } from "@collegeos/api";
import type { CourseGradeResult, GradeScenarioHypothetical, RequiredScoreResult } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

export type ScenarioResult = { ok: true; data: CourseGradeResult } | { ok: false; error: string };
export type RequiredScoreCalcResult = { ok: true; data: RequiredScoreResult } | { ok: false; error: string };

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
