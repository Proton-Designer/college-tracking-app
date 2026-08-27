import {
  addDays,
  startOfWeek,
  type DayCapacity,
  type LocalDate,
} from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import { dataErr, dataOk, type DataResult } from '../data/types';
import {
  getBackplan,
  listMilestones,
  type BackplanMilestoneRow,
  type DeliverableBackplanRow,
} from '../data/backplans';
import { listCourses, type Course } from '../data/courses';
import { listDeliverables, type Deliverable } from '../data/deliverables';
import { getOwnProfile } from '../data/profiles';
import { getUserLocalToday } from '../day/today';
import { computeRiskAssessment, type DeliverableRisk } from '../day/risk';
import { loadCourseGradeProjections } from '../day/grades';
import { computeCapacityHorizon } from '../academic/backplan';
import { getWeeklyPlan, type WeeklyPlanView } from './weeklyPlan';

/**
 * The calendar's read model, shared by both shells.
 *
 * This composition used to live inside apps/web. Every function it calls was already in
 * this package, so it was web-local only because nothing had needed it on mobile yet --
 * which is exactly how two shells start computing the same thing differently. Moving it
 * here keeps D1 honest: two UI shells, one brain. The shells now decide layout and pass a
 * client; they do not decide what a calendar horizon *is*.
 *
 * Both entry points take the client and userId rather than reaching for a server-only
 * Supabase factory, which is what makes them callable from Expo as well as from a Next
 * server component.
 */

/** How far ahead the capacity strip looks -- matches Today's own deadline horizon
 *  convention rather than the (much longer) full obligations list. */
const CAPACITY_HORIZON_DAYS = 13;

export interface BackplanChain {
  backplan: DeliverableBackplanRow;
  milestones: BackplanMilestoneRow[];
}

/** One backplan (if any) + its milestones per deliverable id -- a deliverable with no
 *  backplan yet just has no entry, not a null placeholder. */
export async function loadBackplanChains(
  client: TypedSupabaseClient,
  deliverableIds: number[],
): Promise<Map<number, BackplanChain>> {
  const entries = await Promise.all(
    deliverableIds.map(async (deliverableId) => {
      const backplanResult = await getBackplan(client, deliverableId);
      if (!backplanResult.ok || backplanResult.data == null) return null;
      const backplan = backplanResult.data;

      const milestonesResult = await listMilestones(client, backplan.id);
      const milestones = milestonesResult.ok ? milestonesResult.data : [];

      return [deliverableId, { backplan, milestones }] as const;
    }),
  );

  return new Map(entries.filter((e): e is readonly [number, BackplanChain] => e != null));
}

export interface CalendarObligation {
  deliverable: Deliverable;
  risk: DeliverableRisk | null;
  backplan: BackplanChain | undefined;
}

export interface CalendarHorizon {
  today: LocalDate;
  /** Every open deliverable across every course, in due-date order -- a horizon, not a
   *  month grid. */
  obligations: CalendarObligation[];
  courses: Record<number, Course>;
  capacity: DayCapacity[];
}

/**
 * `now` is injected rather than read from the clock inside, so a caller can render a
 * deterministic horizon in a test and so the local day is derived exactly once, from the
 * profile timezone (B4).
 */
export async function loadCalendarHorizon(
  client: TypedSupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<DataResult<CalendarHorizon>> {
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return dataErr(profileResult.error);
  const profile = profileResult.data;

  const coursesResult = await listCourses(client);
  if (!coursesResult.ok) return dataErr(coursesResult.error);
  const courses = coursesResult.data;

  const today = getUserLocalToday(profile.timezone, now);
  const gradeProjections = await loadCourseGradeProjections(client, userId);

  const courseFacts = courses.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    difficulty_rating: c.difficulty_rating,
    confidence_rating: c.confidence_rating,
    target_grade_pct: c.target_grade_pct,
  }));

  const [risk, deliverablesByCourse, capacityResult] = await Promise.all([
    computeRiskAssessment(
      client,
      userId,
      today,
      courseFacts,
      gradeProjections,
      profile.sleep_baseline_hours,
      profile.timezone,
    ),
    Promise.all(courses.map((c) => listDeliverables(client, c.id))),
    computeCapacityHorizon(
      client,
      userId,
      today,
      addDays(today, CAPACITY_HORIZON_DAYS),
      profile.sleep_baseline_hours,
      profile.timezone,
    ),
  ]);

  const badCourse = deliverablesByCourse.find((r) => !r.ok);
  if (badCourse && !badCourse.ok) return dataErr(badCourse.error);
  if (!capacityResult.ok) return dataErr(capacityResult.error);

  const riskByDeliverableId = new Map(risk.deliverableRisks.map((dr) => [dr.deliverableId, dr]));
  const allDeliverables = deliverablesByCourse.flatMap((r) => (r.ok ? r.data : []));
  const openDeliverables = allDeliverables.filter((d) => d.status !== 'completed');

  const backplanChains = await loadBackplanChains(
    client,
    openDeliverables.map((d) => d.id),
  );

  const obligations: CalendarObligation[] = openDeliverables
    .map((d) => ({
      deliverable: d,
      risk: riskByDeliverableId.get(d.id) ?? null,
      backplan: backplanChains.get(d.id),
    }))
    .sort((a, b) =>
      a.deliverable.local_due_date < b.deliverable.local_due_date
        ? -1
        : a.deliverable.local_due_date > b.deliverable.local_due_date
          ? 1
          : 0,
    );

  return dataOk({
    today,
    obligations,
    courses: Object.fromEntries(courses.map((c) => [c.id, c])),
    capacity: capacityResult.data,
  });
}

export interface ThisWeekView {
  today: LocalDate;
  weekStartDate: LocalDate;
  timezone: string;
  /** Null means no plan has been generated for this week yet -- the empty state's trigger,
   *  never an error. */
  plan: WeeklyPlanView | null;
}

export async function loadThisWeekView(
  client: TypedSupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<DataResult<ThisWeekView>> {
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return dataErr(profileResult.error);
  const profile = profileResult.data;

  const today = getUserLocalToday(profile.timezone, now);
  const weekStartDate = startOfWeek(today);

  const planResult = await getWeeklyPlan(client, userId, weekStartDate, today);
  if (!planResult.ok) return dataErr(planResult.error);

  return dataOk({ today, weekStartDate, timezone: profile.timezone, plan: planResult.data });
}
