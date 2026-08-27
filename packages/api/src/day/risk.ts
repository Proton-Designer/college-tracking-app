import {
  addDays,
  computeAssignmentRisk,
  computeCourseRisk,
  daysBetween,
  localDateFromInstant,
  localTimeToInstant,
  type AssignmentRiskInput,
  type CourseRiskSummary,
  type DeliverableRisk,
  type LocalDate,
  type RiskAssessment,
} from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { CourseGradeProjection } from './grades';

export type { CourseRiskSummary, DeliverableRisk, RiskAssessment } from '@collegeos/core';

/**
 * Fallback waking-hours-per-day used only when the user has no `sleep_baseline_hours`
 * yet (Lead ruling, L5): once a real baseline exists, the waking window is
 * `24 - sleep_baseline_hours` — a personal figure, not a constant — see
 * `wakingHoursPerDayFor` below.
 */
const DEFAULT_WAKING_HOURS_PER_DAY = 16;

function wakingHoursPerDayFor(sleepBaselineHours: number | null): number {
  if (sleepBaselineHours == null) return DEFAULT_WAKING_HOURS_PER_DAY;
  return Math.max(24 - sleepBaselineHours, 1);
}

/**
 * Population-average start delay the procrastination factor falls back to below 5
 * personal observations (packages/core §1). **This is a prior, not a measurement** — a
 * single-demo-user product has no real population to average yet. Exported and named
 * explicitly (Lead ruling, L5) so it's never mistaken for real aggregated data by a
 * future reader. `computeAssignmentRisk` already downgrades `confidence` by one level
 * whenever this fallback is the one actually used (see assignmentRisk.ts's
 * `usingGlobalFallback` check) — verify that still holds if this constant ever moves.
 */
// @barrel-internal -- the L5 ruling's intent was reader visibility INSIDE the engine (so anyone
// reading risk.ts can see 1.5 days is a prior, not a measurement, and verify the confidence
// downgrade still fires when it's used), not package-surface visibility. Putting it on the package
// surface would work against that intent: it invites a consumer to import and display it, and a UI
// rendering "1.5 days average start delay" would present a made-up placeholder as an observed fact --
// exactly the fabrication this product refuses everywhere else. Stays invisible until there's a real
// population to average, at which point it stops being a prior and the question changes entirely.
export const GLOBAL_MEAN_START_DELAY_DAYS_PRIOR = 1.5;

interface CourseFacts {
  id: number;
  code: string;
  name: string;
  difficulty_rating: number | null;
  confidence_rating: number | null;
  target_grade_pct: number | null;
}

/**
 * One batch of queries (never one per deliverable) feeding packages/core's risk engine
 * for every open deliverable at once. Two schema-derived modeling decisions, both
 * flagged in the L4 report:
 *  - "unfinished work units" (completedUnits/plannedUnits) = tasks linked to the
 *    deliverable, since there's no separate units column and this is the closest real
 *    signal already in the schema.
 *  - "committed hours" (congestion) = busy calendar time between today and the due date.
 */
export async function computeRiskAssessment(
  client: TypedSupabaseClient,
  userId: string,
  today: LocalDate,
  courses: CourseFacts[],
  gradeProjections: CourseGradeProjection[],
  sleepBaselineHours: number | null,
  timezone: string,
): Promise<RiskAssessment> {
  const wakingHoursPerDay = wakingHoursPerDayFor(sleepBaselineHours);
  const [
    { data: deliverables, error: delivError },
    { data: tasks, error: taskError },
    { data: calendarEvents, error: calError },
    { data: sessions, error: sessError },
    { data: gradeItems, error: itemError },
    { data: gradeCategories, error: catError },
  ] = await Promise.all([
    // Scoped to exactly the courses the caller passed in, not every non-completed
    // deliverable the user has -- course detail passes a single-course courseFacts, and
    // listCourses now excludes archived courses (migration 0030), so an unscoped fetch
    // here handed courseById a deliverable it had no matching course for, hitting the
    // corrupt-data throw below on entirely valid data. Behavior-preserving for callers
    // that already pass every course (dayView.ts, weeklyPlan.ts): .in() over the full
    // id list is equivalent to unscoped.
    client
      .from('deliverables')
      .select('*')
      .eq('user_id', userId)
      .neq('status', 'completed')
      .in(
        'course_id',
        courses.map((c) => c.id),
      ),
    client.from('tasks').select('deliverable_id, status').eq('user_id', userId).not('deliverable_id', 'is', null),
    client.from('calendar_events').select('start_at, end_at').eq('user_id', userId).eq('is_busy', true),
    client
      .from('task_sessions')
      .select('actual_start, tasks!inner(planned_date, user_id)')
      .eq('tasks.user_id', userId)
      .not('actual_start', 'is', null),
    client.from('grade_items').select('id, category_id').eq('user_id', userId),
    client.from('grade_categories').select('id, weight_pct').eq('user_id', userId),
  ]);
  if (delivError) throw delivError;
  if (taskError) throw taskError;
  if (calError) throw calError;
  if (sessError) throw sessError;
  if (itemError) throw itemError;
  if (catError) throw catError;

  const weightPctByCategoryId = new Map((gradeCategories ?? []).map((c) => [c.id, Number(c.weight_pct)]));
  const weightPctByGradeItemId = new Map(
    (gradeItems ?? []).map((i) => [i.id, weightPctByCategoryId.get(i.category_id) ?? 0]),
  );

  const unitsByDeliverable = new Map<number, { planned: number; completed: number }>();
  for (const t of tasks ?? []) {
    if (t.deliverable_id == null) continue;
    const bucket = unitsByDeliverable.get(t.deliverable_id) ?? { planned: 0, completed: 0 };
    bucket.planned += 1;
    if (t.status === 'completed') bucket.completed += 1;
    unitsByDeliverable.set(t.deliverable_id, bucket);
  }

  const startDelays: number[] = [];
  for (const s of sessions ?? []) {
    const plannedDate = (s.tasks as unknown as { planned_date: LocalDate }).planned_date;
    // B4: the day a session actually started is a LOCAL day. Slicing the UTC ISO string
    // files an 8pm CDT start under the next calendar day, which inflates every start
    // delay by one for anyone who works in the evening.
    const actualDate = localDateFromInstant(new Date(s.actual_start!), timezone);
    startDelays.push(Math.max(0, daysBetween(plannedDate, actualDate)));
  }
  const userMeanStartDelayDays =
    startDelays.length > 0 ? startDelays.reduce((a, b) => a + b, 0) / startDelays.length : undefined;

  const gradeByCourse = new Map(gradeProjections.map((g) => [g.courseId, g.result]));
  const courseById = new Map(courses.map((c) => [c.id, c]));

  const deliverableRisks: DeliverableRisk[] = (deliverables ?? []).map((d) => {
    const course = courseById.get(d.course_id);
    // FK-guaranteed, not a legitimate "unknown" -- if this ever misses, the data is
    // corrupt and should fail loud rather than render a fabricated course label.
    if (!course) throw new Error(`Deliverable ${d.id} references missing course ${d.course_id}`);
    const units = unitsByDeliverable.get(d.id) ?? { planned: 0, completed: 0 };
    const windowDays = Math.max(daysBetween(today, d.local_due_date), 0);
    const availableHours = windowDays * wakingHoursPerDay;
    const committedHours = sumCalendarHoursInWindow(calendarEvents ?? [], today, d.local_due_date, timezone);
    const grade = gradeByCourse.get(d.course_id);
    const weightPct = d.grade_item_id != null ? (weightPctByGradeItemId.get(d.grade_item_id) ?? 0) : 0;

    // exactOptionalPropertyTypes forbids assigning `undefined` to an optional field --
    // only include these keys when a real value exists, rather than fabricating one.
    const input: AssignmentRiskInput = {
      today,
      dueDate: d.local_due_date,
      weightPct,
      completedUnits: units.completed,
      plannedUnits: units.planned,
      committedHours,
      availableHours,
      userStartDelaySampleSize: startDelays.length,
      globalMeanStartDelayDays: GLOBAL_MEAN_START_DELAY_DAYS_PRIOR,
      ...(course?.difficulty_rating != null ? { difficultyRating: course.difficulty_rating } : {}),
      ...(course?.confidence_rating != null ? { confidenceRating: course.confidence_rating } : {}),
      ...(userMeanStartDelayDays != null ? { userMeanStartDelayDays } : {}),
      ...(course?.target_grade_pct != null ? { targetPct: course.target_grade_pct } : {}),
      ...(grade?.projectedGrade != null ? { projectedPct: grade.projectedGrade } : {}),
    };

    return {
      deliverableId: d.id,
      courseId: d.course_id,
      courseCode: course.code,
      courseName: course.name,
      title: d.title,
      result: computeAssignmentRisk(input),
      input,
    };
  });

  const byCourseGroup = new Map<number, DeliverableRisk[]>();
  for (const dr of deliverableRisks) {
    const list = byCourseGroup.get(dr.courseId) ?? [];
    list.push(dr);
    byCourseGroup.set(dr.courseId, list);
  }

  const courseRisks: CourseRiskSummary[] = [...byCourseGroup.entries()].map(([courseId, risks]) => ({
    courseId,
    courseCode: risks[0]!.courseCode,
    courseName: risks[0]!.courseName,
    result: computeCourseRisk({ items: risks.map((r) => ({ id: String(r.deliverableId), score: r.result.score })) }),
    itemLabels: Object.fromEntries(risks.map((r) => [String(r.deliverableId), r.title])),
  }));

  return { deliverableRisks, courseRisks };
}

function sumCalendarHoursInWindow(
  events: Array<{ start_at: string; end_at: string }>,
  today: LocalDate,
  dueDate: LocalDate,
  timezone: string,
): number {
  // B4: the window is the user's real local days [today, dueDate], not UTC midnight --
  // see CLAUDE.md's "never derive a day boundary from UTC." localTimeToInstant converts
  // correctly; addDays(dueDate, 1) makes this a half-open interval ending at the real
  // start of the day AFTER dueDate, equivalent to "through the end of dueDate."
  const windowStart = new Date(localTimeToInstant(today, 0, 0, timezone)).getTime();
  const windowEnd = new Date(localTimeToInstant(addDays(dueDate, 1), 0, 0, timezone)).getTime();
  let totalMs = 0;
  for (const e of events) {
    const start = Math.max(new Date(e.start_at).getTime(), windowStart);
    const end = Math.min(new Date(e.end_at).getTime(), windowEnd);
    if (end > start) totalMs += end - start;
  }
  return totalMs / (1000 * 60 * 60);
}
