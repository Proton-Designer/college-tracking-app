"use server";

import { computeCourseGradeScenario, computeCourseRequiredScore } from "@collegeos/api";
import type { CourseGradeResult, GradeScenarioHypothetical, RequiredScoreResult } from "@collegeos/core";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export type ScenarioResult = { ok: true; data: CourseGradeResult } | { ok: false; error: string };
export type RequiredScoreCalcResult = { ok: true; data: RequiredScoreResult } | { ok: false; error: string };

async function requireUserId(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  return { ok: true, userId: user.id };
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
