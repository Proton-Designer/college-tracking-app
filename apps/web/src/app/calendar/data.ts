import "server-only";
import {
  computeRiskAssessment,
  getOwnProfile,
  getUserLocalToday,
  listCourses,
  loadCourseGradeProjections,
  type Course,
  type DeliverableRisk,
} from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface CalendarData {
  today: string;
  /** Every open deliverable across every course, in due-date order — a horizon, not a month grid. */
  obligations: DeliverableRisk[];
  courses: Record<number, Course>;
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
    difficulty_rating: c.difficulty_rating,
    confidence_rating: c.confidence_rating,
    target_grade_pct: c.target_grade_pct,
  }));

  const risk = await computeRiskAssessment(client, user.id, today, courseFacts, gradeProjections, profile.sleep_baseline_hours);

  const obligations = [...risk.deliverableRisks].sort((a, b) => (a.input.dueDate < b.input.dueDate ? -1 : a.input.dueDate > b.input.dueDate ? 1 : 0));

  return {
    ok: true,
    data: { today, obligations, courses: Object.fromEntries(courses.map((c) => [c.id, c])) },
  };
}
