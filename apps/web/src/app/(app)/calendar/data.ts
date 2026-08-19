import "server-only";
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
import { loadBackplanChains, type BackplanChain } from "@/lib/loadBackplanChains";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/** How far ahead the capacity strip looks — matches Today's own deadline horizon
 *  convention rather than the (much longer) full obligations list. */
const CAPACITY_HORIZON_DAYS = 13;

export interface CalendarObligation {
  deliverable: Deliverable;
  risk: DeliverableRisk | null;
  backplan: BackplanChain | undefined;
}

export interface CalendarData {
  today: string;
  /** Every open deliverable across every course, in due-date order — a horizon, not a month grid. */
  obligations: CalendarObligation[];
  courses: Record<number, Course>;
  capacity: DayCapacity[];
}

export type CalendarLoadResult = { ok: true; data: CalendarData } | { ok: false; error: string };

export async function loadCalendarHorizon(): Promise<CalendarLoadResult> {
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

  const [risk, deliverablesByCourse, capacityResult] = await Promise.all([
    computeRiskAssessment(client, user.id, today, courseFacts, gradeProjections, profile.sleep_baseline_hours),
    Promise.all(courses.map((c) => listDeliverables(client, c.id))),
    computeCapacityHorizon(client, user.id, today, addDays(today, CAPACITY_HORIZON_DAYS), profile.sleep_baseline_hours),
  ]);

  const badCourse = deliverablesByCourse.find((r) => !r.ok);
  if (badCourse && !badCourse.ok) return { ok: false, error: badCourse.error.message };
  if (!capacityResult.ok) return { ok: false, error: capacityResult.error.message };

  const riskByDeliverableId = new Map(risk.deliverableRisks.map((dr) => [dr.deliverableId, dr]));
  const allDeliverables = deliverablesByCourse.flatMap((r) => (r.ok ? r.data : []));
  const openDeliverables = allDeliverables.filter((d) => d.status !== "completed");

  const backplanChains = await loadBackplanChains(client, openDeliverables.map((d) => d.id));

  const obligations: CalendarObligation[] = openDeliverables
    .map((d) => ({ deliverable: d, risk: riskByDeliverableId.get(d.id) ?? null, backplan: backplanChains.get(d.id) }))
    .sort((a, b) => (a.deliverable.local_due_date < b.deliverable.local_due_date ? -1 : a.deliverable.local_due_date > b.deliverable.local_due_date ? 1 : 0));

  return {
    ok: true,
    data: { today, obligations, courses: Object.fromEntries(courses.map((c) => [c.id, c])), capacity: capacityResult.data },
  };
}
