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
import { useCallback, useEffect, useState } from "react";
import { getMobileSupabaseClient } from "./supabase/client";
import { useAuthSession } from "./useAuthSession";

export interface CoursesIndexRow {
  course: Course;
  gradeResult: CourseGradeResult | null;
  courseRisk: CourseRiskSummary | null;
  nextDeadline: { title: string; localDueDate: string } | null;
}

export type CoursesFetchState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: { rows: CoursesIndexRow[]; today: string } };

/** Mirrors apps/web/src/app/(app)/courses/data.ts's loadCoursesIndex exactly — same
 *  sources, same "earliest open deliverable per course" next-deadline pick, same
 *  risk-descending sort. Nothing here computes a domain value itself. */
export function useCoursesIndexData() {
  const { session, loading: authLoading } = useAuthSession();
  const userId = session?.user.id;
  const [fetchState, setFetchState] = useState<CoursesFetchState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (authLoading || !userId) return;
    let cancelled = false;
    const client = getMobileSupabaseClient();

    getOwnProfile(client).then((profileResult) => {
      if (cancelled) return;
      if (!profileResult.ok) {
        setFetchState({ status: "error", error: profileResult.error.message });
        return;
      }
      const profile = profileResult.data;
      const today = getUserLocalToday(profile.timezone, new Date());

      listCourses(client).then((coursesResult) => {
        if (cancelled) return;
        if (!coursesResult.ok) {
          setFetchState({ status: "error", error: coursesResult.error.message });
          return;
        }
        const courses = coursesResult.data;
        const courseFacts = courses.map((c) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          difficulty_rating: c.difficulty_rating,
          confidence_rating: c.confidence_rating,
          target_grade_pct: c.target_grade_pct,
        }));

        loadCourseGradeProjections(client, userId).then((gradeProjections) => {
          if (cancelled) return;

          computeRiskAssessment(client, userId, today, courseFacts, gradeProjections, profile.sleep_baseline_hours, profile.timezone).then((risk) => {
            if (cancelled) return;

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
            rows.sort((a, b) => (b.courseRisk?.result.score ?? 0) - (a.courseRisk?.result.score ?? 0));

            setFetchState({ status: "ready", data: { rows, today } });
          });
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, userId, reloadToken]);

  if (authLoading) return { status: "loading" as const, refetch };
  if (!userId) return { status: "error" as const, error: "Not signed in.", refetch };
  return { ...fetchState, refetch };
}
