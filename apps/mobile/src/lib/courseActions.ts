import { computeCourseGradeScenario, computeCourseRequiredScore } from "@collegeos/api";
import type { CourseGradeResult, GradeScenarioHypothetical, RequiredScoreResult } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

export type ScenarioResult = { ok: true; data: CourseGradeResult } | { ok: false; error: string };
export type RequiredScoreCalcResult = { ok: true; data: RequiredScoreResult } | { ok: false; error: string };

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
