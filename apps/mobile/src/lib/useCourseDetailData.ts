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
import { useCallback, useEffect, useState } from "react";
import { loadBackplanChains, type BackplanChain } from "./loadBackplanChains";
import { getMobileSupabaseClient } from "./supabase/client";
import { useAuthSession } from "./useAuthSession";

export interface CourseDetailData {
  course: Course;
  gradeResult: CourseGradeResult | null;
  courseRisk: CourseRiskSummary | null;
  deliverableRisks: DeliverableRisk[];
  today: string;
  categories: GradeCategoryRow[];
  gradeItems: GradeItemRow[];
  gradeBoundaries: GradeBoundaryRow[];
  deliverables: Deliverable[];
  backplanChains: Map<number, BackplanChain>;
}

export type CourseDetailFetchState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: CourseDetailData };

/** Mirrors apps/web/src/app/(app)/courses/[id]/data.ts's loadCourseDetail exactly. */
export function useCourseDetailData(courseId: number) {
  const { session, loading: authLoading } = useAuthSession();
  const userId = session?.user.id;
  const [fetchState, setFetchState] = useState<CourseDetailFetchState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (authLoading || !userId) return;
    let cancelled = false;
    const client = getMobileSupabaseClient();

    getCourse(client, courseId).then((courseResult) => {
      if (cancelled) return;
      if (!courseResult.ok) {
        setFetchState({ status: "error", error: courseResult.error.message });
        return;
      }
      const course = courseResult.data;

      getOwnProfile(client).then((profileResult) => {
        if (cancelled) return;
        if (!profileResult.ok) {
          setFetchState({ status: "error", error: profileResult.error.message });
          return;
        }
        const profile = profileResult.data;
        const today = getUserLocalToday(profile.timezone, new Date());
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

        loadCourseGradeProjections(client, userId).then((gradeProjections) => {
          if (cancelled) return;

          Promise.all([
            computeRiskAssessment(client, userId, today, courseFacts, gradeProjections, profile.sleep_baseline_hours),
            listGradeCategories(client, courseId),
            listGradeItems(client, courseId),
            listGradeBoundaries(client, courseId),
            listDeliverables(client, courseId),
          ]).then(([risk, categoriesResult, gradeItemsResult, gradeBoundariesResult, deliverablesResult]) => {
            if (cancelled) return;
            if (!categoriesResult.ok) {
              setFetchState({ status: "error", error: categoriesResult.error.message });
              return;
            }
            if (!gradeItemsResult.ok) {
              setFetchState({ status: "error", error: gradeItemsResult.error.message });
              return;
            }
            if (!gradeBoundariesResult.ok) {
              setFetchState({ status: "error", error: gradeBoundariesResult.error.message });
              return;
            }
            if (!deliverablesResult.ok) {
              setFetchState({ status: "error", error: deliverablesResult.error.message });
              return;
            }

            loadBackplanChains(client, deliverablesResult.data.map((d) => d.id)).then((backplanChains) => {
              if (cancelled) return;

              setFetchState({
                status: "ready",
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
              });
            });
          });
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, userId, courseId, reloadToken]);

  if (authLoading) return { status: "loading" as const, refetch };
  if (!userId) return { status: "error" as const, error: "Not signed in.", refetch };
  return { ...fetchState, refetch };
}
