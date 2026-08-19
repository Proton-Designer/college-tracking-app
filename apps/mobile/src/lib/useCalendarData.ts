import {
  computeCapacityHorizon,
  computeRiskAssessment,
  getOwnProfile,
  getUserLocalToday,
  listCourses,
  listDeliverables,
  loadCourseGradeProjections,
  type Course,
  type Deliverable,
  type DeliverableRisk,
} from "@collegeos/api";
import { addDays, type DayCapacity } from "@collegeos/core";
import { useCallback, useEffect, useState } from "react";
import { loadBackplanChains, type BackplanChain } from "./loadBackplanChains";
import { getMobileSupabaseClient } from "./supabase/client";
import { useAuthSession } from "./useAuthSession";

const CAPACITY_HORIZON_DAYS = 13;

export interface CalendarObligation {
  deliverable: Deliverable;
  risk: DeliverableRisk | null;
  backplan: BackplanChain | undefined;
}

export interface CalendarData {
  today: string;
  obligations: CalendarObligation[];
  courses: Record<number, Course>;
  capacity: DayCapacity[];
}

export type CalendarFetchState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: CalendarData };

/** Mirrors apps/web/src/app/(app)/calendar/data.ts's loadCalendarHorizon exactly. */
export function useCalendarData() {
  const { session, loading: authLoading } = useAuthSession();
  const userId = session?.user.id;
  const [fetchState, setFetchState] = useState<CalendarFetchState>({ status: "loading" });
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
          difficulty_rating: c.difficulty_rating,
          confidence_rating: c.confidence_rating,
          target_grade_pct: c.target_grade_pct,
        }));

        loadCourseGradeProjections(client, userId).then((gradeProjections) => {
          if (cancelled) return;

          Promise.all([
            computeRiskAssessment(client, userId, today, courseFacts, gradeProjections, profile.sleep_baseline_hours),
            Promise.all(courses.map((c) => listDeliverables(client, c.id))),
            computeCapacityHorizon(client, userId, today, addDays(today, CAPACITY_HORIZON_DAYS), profile.sleep_baseline_hours),
          ]).then(([risk, deliverablesByCourse, capacityResult]) => {
            if (cancelled) return;

            const badCourse = deliverablesByCourse.find((r) => !r.ok);
            if (badCourse && !badCourse.ok) {
              setFetchState({ status: "error", error: badCourse.error.message });
              return;
            }
            if (!capacityResult.ok) {
              setFetchState({ status: "error", error: capacityResult.error.message });
              return;
            }

            const riskByDeliverableId = new Map(risk.deliverableRisks.map((dr) => [dr.deliverableId, dr]));
            const allDeliverables = deliverablesByCourse.flatMap((r) => (r.ok ? r.data : []));
            const openDeliverables = allDeliverables.filter((d) => d.status !== "completed");

            loadBackplanChains(client, openDeliverables.map((d) => d.id)).then((backplanChains) => {
              if (cancelled) return;

              const obligations: CalendarObligation[] = openDeliverables
                .map((d) => ({ deliverable: d, risk: riskByDeliverableId.get(d.id) ?? null, backplan: backplanChains.get(d.id) }))
                .sort((a, b) =>
                  a.deliverable.local_due_date < b.deliverable.local_due_date
                    ? -1
                    : a.deliverable.local_due_date > b.deliverable.local_due_date
                      ? 1
                      : 0,
                );

              setFetchState({
                status: "ready",
                data: {
                  today,
                  obligations,
                  courses: Object.fromEntries(courses.map((c) => [c.id, c])),
                  capacity: capacityResult.data,
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
  }, [authLoading, userId, reloadToken]);

  if (authLoading) return { status: "loading" as const, refetch };
  if (!userId) return { status: "error" as const, error: "Not signed in.", refetch };
  return { ...fetchState, refetch };
}
