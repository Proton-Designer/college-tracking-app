import "server-only";
import {
  computeRiskAssessment,
  getCourse,
  getOwnProfile,
  getUserLocalToday,
  listDeliverables,
  listGradeBoundaries,
  listGradeCategories,
  listGradeItems,
  loadCourseGradeProjections,
  type Course,
  type CourseRiskSummary,
  type Deliverable,
  type DeliverableRisk,
  type GradeBoundaryRow,
  type GradeCategoryRow,
  type GradeItemRow,
} from "@collegeos/api";
import type { CourseGradeResult } from "@collegeos/core";
import { loadBackplanChains, type BackplanChain } from "@/lib/loadBackplanChains";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface CourseDetailData {
  course: Course;
  gradeResult: CourseGradeResult | null;
  courseRisk: CourseRiskSummary | null;
  /** Only this course's open deliverables — computeRiskAssessment computes for every open
   *  deliverable across all courses in one batch, filtered down here. */
  deliverableRisks: DeliverableRisk[];
  today: string;
  categories: GradeCategoryRow[];
  gradeItems: GradeItemRow[];
  gradeBoundaries: GradeBoundaryRow[];
  deliverables: Deliverable[];
  backplanChains: Map<number, BackplanChain>;
}

export type CourseDetailLoadResult = { ok: true; data: CourseDetailData } | { ok: false; error: string };

export async function loadCourseDetail(courseId: number): Promise<CourseDetailLoadResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const courseResult = await getCourse(client, courseId);
  if (!courseResult.ok) return { ok: false, error: courseResult.error.message };
  const course = courseResult.data;

  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const profile = profileResult.data;

  const today = getUserLocalToday(profile.timezone, new Date());
  const gradeProjections = await loadCourseGradeProjections(client, user.id);

  const courseFacts = [
    {
      id: course.id,
      code: course.code,
      name: course.name,
      difficulty_rating: course.difficulty_rating,
      confidence_rating: course.confidence_rating,
      target_grade_pct: course.target_grade_pct,
    },
  ];

  const [risk, categoriesResult, gradeItemsResult, gradeBoundariesResult, deliverablesResult] = await Promise.all([
    computeRiskAssessment(client, user.id, today, courseFacts, gradeProjections, profile.sleep_baseline_hours),
    listGradeCategories(client, courseId),
    listGradeItems(client, courseId),
    listGradeBoundaries(client, courseId),
    listDeliverables(client, courseId),
  ]);

  if (!categoriesResult.ok) return { ok: false, error: categoriesResult.error.message };
  if (!gradeItemsResult.ok) return { ok: false, error: gradeItemsResult.error.message };
  if (!gradeBoundariesResult.ok) return { ok: false, error: gradeBoundariesResult.error.message };
  if (!deliverablesResult.ok) return { ok: false, error: deliverablesResult.error.message };

  const backplanChains = await loadBackplanChains(client, deliverablesResult.data.map((d) => d.id));

  return {
    ok: true,
    data: {
      course,
      gradeResult: gradeProjections.find((g) => g.courseId === courseId)?.result ?? null,
      courseRisk: risk.courseRisks.find((r) => r.courseId === courseId) ?? null,
      deliverableRisks: risk.deliverableRisks.filter((dr) => dr.courseId === courseId),
      today,
      categories: categoriesResult.data,
      gradeItems: gradeItemsResult.data,
      gradeBoundaries: gradeBoundariesResult.data,
      deliverables: deliverablesResult.data,
      backplanChains,
    },
  };
}
