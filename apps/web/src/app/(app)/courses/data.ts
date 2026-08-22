import "server-only";
import {
  computeRiskAssessment,
  getOwnProfile,
  getUserLocalToday,
  listCourses,
  loadCourseGradeProjections,
  type Course,
  type CourseRiskSummary,
} from "@collegeos/api";
import type { CourseGradeResult } from "@collegeos/core";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface CoursesIndexRow {
  course: Course;
  gradeResult: CourseGradeResult | null;
  courseRisk: CourseRiskSummary | null;
  nextDeadline: { title: string; localDueDate: string } | null;
}

export type CoursesLoadResult =
  | { ok: true; data: { rows: CoursesIndexRow[]; today: string } }
  | { ok: false; error: string };

/**
 * Assembles the /courses index from three already-computed sources — nothing here
 * scores or projects anything itself, it only groups packages/core's outputs by course
 * and picks each course's earliest open deliverable for "next deadline".
 */
export async function loadCoursesIndex(): Promise<CoursesLoadResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const profile = profileResult.data;

  const coursesResult = await listCourses(client);
  if (!coursesResult.ok) return { ok: false, error: coursesResult.error.message };
  const courses = coursesResult.data;

  const today = getUserLocalToday(profile.timezone, new Date());
  const gradeProjections = await loadCourseGradeProjections(client, user.id);

  const courseFacts = courses.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    difficulty_rating: c.difficulty_rating,
    confidence_rating: c.confidence_rating,
    target_grade_pct: c.target_grade_pct,
  }));

  const risk = await computeRiskAssessment(
    client,
    user.id,
    today,
    courseFacts,
    gradeProjections,
    profile.sleep_baseline_hours,
    profile.timezone,
  );

  const gradeByCourse = new Map(gradeProjections.map((g) => [g.courseId, g.result]));
  const riskByCourse = new Map(risk.courseRisks.map((r) => [r.courseId, r]));

  const nextDeadlineByCourse = new Map<number, { title: string; localDueDate: string }>();
  for (const dr of risk.deliverableRisks) {
    const existing = nextDeadlineByCourse.get(dr.courseId);
    if (!existing || dr.input.dueDate < existing.localDueDate) {
      nextDeadlineByCourse.set(dr.courseId, { title: dr.title, localDueDate: dr.input.dueDate });
    }
  }

  const rows: CoursesIndexRow[] = courses.map((course) => ({
    course,
    gradeResult: gradeByCourse.get(course.id) ?? null,
    courseRisk: riskByCourse.get(course.id) ?? null,
    nextDeadline: nextDeadlineByCourse.get(course.id) ?? null,
  }));

  // Spec: "Sorted by risk descending."
  rows.sort((a, b) => (b.courseRisk?.result.score ?? 0) - (a.courseRisk?.result.score ?? 0));

  return { ok: true, data: { rows, today } };
}
