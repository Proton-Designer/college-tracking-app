import {
  computeAssignmentRisk,
  computeCourseRisk,
  daysBetween,
  type AssignmentRiskInput,
  type AssignmentRiskResult,
  type CourseRiskResult,
  type LocalDate,
} from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { CourseGradeProjection } from './grades';

/**
 * Rough waking-hours-per-day used to turn a due-date window into an "available hours"
 * figure for the congestion factor. Documented approximation, not a measured quantity —
 * flagged in the L4 report as a candidate for a real per-user setting later.
 */
const WAKING_HOURS_PER_DAY = 16;

/**
 * Population-average start delay the procrastination factor falls back to below 5
 * personal observations (packages/core §1). A single-demo-user product has no real
 * population to compute this from yet — placeholder pending multi-user data, flagged in
 * the L4 report.
 */
const GLOBAL_MEAN_START_DELAY_DAYS = 1.5;

export interface DeliverableRisk {
  deliverableId: number;
  courseId: number;
  title: string;
  result: AssignmentRiskResult;
}

export interface CourseRiskSummary {
  courseId: number;
  result: CourseRiskResult;
}

export interface RiskAssessment {
  deliverableRisks: DeliverableRisk[];
  courseRisks: CourseRiskSummary[];
}

interface CourseFacts {
  id: number;
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
): Promise<RiskAssessment> {
  const [
    { data: deliverables, error: delivError },
    { data: tasks, error: taskError },
    { data: calendarEvents, error: calError },
    { data: sessions, error: sessError },
    { data: gradeItems, error: itemError },
    { data: gradeCategories, error: catError },
  ] = await Promise.all([
    client.from('deliverables').select('*').eq('user_id', userId).neq('status', 'completed'),
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
    const actualDate = new Date(s.actual_start!).toISOString().slice(0, 10);
    startDelays.push(Math.max(0, daysBetween(plannedDate, actualDate)));
  }
  const userMeanStartDelayDays =
    startDelays.length > 0 ? startDelays.reduce((a, b) => a + b, 0) / startDelays.length : undefined;

  const gradeByCourse = new Map(gradeProjections.map((g) => [g.courseId, g.result]));
  const courseById = new Map(courses.map((c) => [c.id, c]));

  const deliverableRisks: DeliverableRisk[] = (deliverables ?? []).map((d) => {
    const course = courseById.get(d.course_id);
    const units = unitsByDeliverable.get(d.id) ?? { planned: 0, completed: 0 };
    const windowDays = Math.max(daysBetween(today, d.local_due_date), 0);
    const availableHours = windowDays * WAKING_HOURS_PER_DAY;
    const committedHours = sumCalendarHoursInWindow(calendarEvents ?? [], today, d.local_due_date);
    const grade = gradeByCourse.get(d.course_id);
    const weightPct = d.grade_item_id != null ? (weightPctByGradeItemId.get(d.grade_item_id) ?? 0) : 0;

    const input: AssignmentRiskInput = {
      today,
      dueDate: d.local_due_date,
      weightPct,
      difficultyRating: course?.difficulty_rating ?? undefined,
      confidenceRating: course?.confidence_rating ?? undefined,
      completedUnits: units.completed,
      plannedUnits: units.planned,
      committedHours,
      availableHours,
      userMeanStartDelayDays,
      userStartDelaySampleSize: startDelays.length,
      globalMeanStartDelayDays: GLOBAL_MEAN_START_DELAY_DAYS,
      targetPct: course?.target_grade_pct ?? undefined,
      projectedPct: grade?.projectedGrade ?? undefined,
    };

    return { deliverableId: d.id, courseId: d.course_id, title: d.title, result: computeAssignmentRisk(input) };
  });

  const byCourseGroup = new Map<number, DeliverableRisk[]>();
  for (const dr of deliverableRisks) {
    const list = byCourseGroup.get(dr.courseId) ?? [];
    list.push(dr);
    byCourseGroup.set(dr.courseId, list);
  }

  const courseRisks: CourseRiskSummary[] = [...byCourseGroup.entries()].map(([courseId, risks]) => ({
    courseId,
    result: computeCourseRisk({ items: risks.map((r) => ({ id: String(r.deliverableId), score: r.result.score })) }),
  }));

  return { deliverableRisks, courseRisks };
}

function sumCalendarHoursInWindow(
  events: Array<{ start_at: string; end_at: string }>,
  today: LocalDate,
  dueDate: LocalDate,
): number {
  const windowStart = new Date(`${today}T00:00:00Z`).getTime();
  const windowEnd = new Date(`${dueDate}T23:59:59Z`).getTime();
  let totalMs = 0;
  for (const e of events) {
    const start = Math.max(new Date(e.start_at).getTime(), windowStart);
    const end = Math.min(new Date(e.end_at).getTime(), windowEnd);
    if (end > start) totalMs += end - start;
  }
  return totalMs / (1000 * 60 * 60);
}
