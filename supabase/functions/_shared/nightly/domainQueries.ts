// Deno-side ports of packages/api's day/*.ts query+compute functions, needed because the
// nightly job runs in the Edge Runtime (see decision D16, .brain/memory/decisions.md) and
// packages/api itself can't be imported the same mechanical way _shared/core was mirrored
// (it pulls in @supabase/supabase-js and the generated database.types.ts as real
// dependencies, not just extensionless internal imports -- a bigger lift, deliberately
// scoped out for tonight; see D16's closing note).
//
// What IS shared with packages/api: every actual domain calculation (computeAssignmentRisk,
// computeCourseRisk, computeCourseGrade, computeRecoveryModeTrigger, computePlanningExecutionGap,
// computeBounceBack, computeFrictionDistribution/Trend) comes from _shared/core, the generated
// mirror -- ONE implementation of the math. What's duplicated here is QUERY COMPOSITION only
// (which rows to select, which joins) -- mechanical, low-drift-risk, and the exact same
// pattern each ported function is commented with its packages/api source file so a future
// change to one is easy to find and check against the other.
//
// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;

import {
  computeAssignmentRisk,
  computeBounceBack,
  computeCourseGrade,
  computeCourseRisk,
  computeFrictionDistribution,
  computeFrictionTrend,
  computePlanningExecutionGap,
  computeRecoveryModeTrigger,
  daysBetween,
  addDays,
  localDateFromInstant,
  localTimeToInstant,
  type AssignmentRiskInput,
  type BounceBackResult,
  type CauseTrendEntry,
  type CourseGradeProjection,
  type CourseRiskSummary,
  type DayOutcome,
  type DeliverableRisk,
  type FrictionDistribution,
  type FrictionLog,
  type GradeCategory,
  type GradeItem,
  type LocalDate,
  type PlanningExecutionResult,
  type RecoveryModeResult,
  type RiskAssessment,
} from "../core/index.ts";

const GLOBAL_MEAN_START_DELAY_DAYS_PRIOR = 1.5; // mirrors risk.ts's own documented prior
const DEFAULT_WAKING_HOURS_PER_DAY = 16;
const HARD_DEADLINE_WINDOW_HOURS = 48;
const HISTORICAL_CAPACITY_LOOKBACK_DAYS = 30;

function wakingHoursPerDayFor(sleepBaselineHours: number | null): number {
  if (sleepBaselineHours == null) return DEFAULT_WAKING_HOURS_PER_DAY;
  return Math.max(24 - sleepBaselineHours, 1);
}

function minutesSinceMidnightUTC(iso: string): number {
  const d = new Date(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** actualStartMin relative to plannedStartMin, computed from the real elapsed time between
 *  the two instants rather than by taking minutesSinceMidnightUTC of each and subtracting.
 *  The subtract-two-midnights approach wraps incorrectly whenever planned and actual straddle
 *  UTC midnight -- routine for an evening-timeboxed task in a US timezone (UTC midnight is
 *  ~7-8pm Eastern) -- turning a real 30-minute delay into a reported -1410 ("23.5h early").
 *  plannedStartMin keeps its literal minutes-since-midnight meaning; actualStartMin is only
 *  ever consumed as (actualStartMin - plannedStartMin), so anchoring it to the real elapsed
 *  minutes past plannedStartMin keeps that diff correct across the day boundary. Mirrors
 *  packages/api/src/day/planningExecution.ts -- keep both in sync. */
function actualStartMinFrom(plannedStartMin: number, plannedIso: string, actualIso: string): number {
  const elapsedMin = (new Date(actualIso).getTime() - new Date(plannedIso).getTime()) / 60_000;
  return plannedStartMin + elapsedMin;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

// ============================================================================
// Ported from packages/api/src/day/grades.ts
// ============================================================================
export async function loadCourseGradeProjections(
  client: AnySupabaseClient,
  userId: string,
): Promise<CourseGradeProjection[]> {
  const [{ data: categories, error: catError }, { data: items, error: itemError }] = await Promise.all([
    client.from("grade_categories").select("*").eq("user_id", userId),
    client.from("grade_items").select("*").eq("user_id", userId),
  ]);
  if (catError) throw catError;
  if (itemError) throw itemError;

  const categoriesByCourse = new Map<number, GradeCategory[]>();
  // deno-lint-ignore no-explicit-any
  for (const row of (categories ?? []) as any[]) {
    const category: GradeCategory = {
      id: String(row.id),
      name: row.name,
      weightPct: Number(row.weight_pct),
      dropLowestN: row.drop_lowest_n,
      expectedItemCount: row.expected_item_count,
    };
    const list = categoriesByCourse.get(row.course_id) ?? [];
    list.push(category);
    categoriesByCourse.set(row.course_id, list);
  }

  const itemsByCourse = new Map<number, GradeItem[]>();
  // deno-lint-ignore no-explicit-any
  for (const row of (items ?? []) as any[]) {
    const item: GradeItem = {
      id: String(row.id),
      categoryId: String(row.category_id),
      name: row.name,
      pointsEarned: row.points_earned == null ? null : Number(row.points_earned),
      pointsPossible: Number(row.points_possible),
      isExcused: row.is_excused,
    };
    const list = itemsByCourse.get(row.course_id) ?? [];
    list.push(item);
    itemsByCourse.set(row.course_id, list);
  }

  const courseIds = new Set([...categoriesByCourse.keys(), ...itemsByCourse.keys()]);
  return [...courseIds].map((courseId) => ({
    courseId,
    result: computeCourseGrade(categoriesByCourse.get(courseId) ?? [], itemsByCourse.get(courseId) ?? [], {
      assumption: "current",
    }),
  }));
}

// ============================================================================
// Ported from packages/api/src/day/risk.ts
// ============================================================================
interface CourseFacts {
  id: number;
  code: string;
  name: string;
  difficulty_rating: number | null;
  confidence_rating: number | null;
  target_grade_pct: number | null;
}

function sumCalendarHoursInWindow(
  events: Array<{ start_at: string; end_at: string }>,
  today: LocalDate,
  dueDate: LocalDate,
  timezone: string,
): number {
  // B4 (mirrors packages/api/src/day/risk.ts): the window is the user's real local
  // days, not UTC midnight -- see CLAUDE.md's "never derive a day boundary from UTC."
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

export async function computeRiskAssessment(
  client: AnySupabaseClient,
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
    // B1/B2 (packages/api/src/day/risk.ts): scoped to exactly the courses the caller
    // passed in, not every non-completed deliverable the user has -- this mirror had the
    // same unscoped fetch and was never updated when the Node side was fixed. Now that
    // assembleReport.ts's courses query excludes archived courses (migration 0030), an
    // archived course's own deliverable would otherwise hit the corrupt-data throw below.
    client
      .from("deliverables")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "completed")
      .in(
        "course_id",
        courses.map((c) => c.id),
      ),
    client.from("tasks").select("deliverable_id, status").eq("user_id", userId).not("deliverable_id", "is", null),
    client.from("calendar_events").select("start_at, end_at").eq("user_id", userId).eq("is_busy", true),
    client
      .from("task_sessions")
      .select("actual_start, tasks!inner(planned_date, user_id)")
      .eq("tasks.user_id", userId)
      .not("actual_start", "is", null),
    client.from("grade_items").select("id, category_id").eq("user_id", userId),
    client.from("grade_categories").select("id, weight_pct").eq("user_id", userId),
  ]);
  if (delivError) throw delivError;
  if (taskError) throw taskError;
  if (calError) throw calError;
  if (sessError) throw sessError;
  if (itemError) throw itemError;
  if (catError) throw catError;

  const weightPctByCategoryId = new Map<number, number>(
    // deno-lint-ignore no-explicit-any
    (gradeCategories ?? []).map((c: any) => [c.id, Number(c.weight_pct)]),
  );
  const weightPctByGradeItemId = new Map<number, number>(
    // deno-lint-ignore no-explicit-any
    (gradeItems ?? []).map((i: any) => [i.id, weightPctByCategoryId.get(i.category_id) ?? 0]),
  );

  const unitsByDeliverable = new Map<number, { planned: number; completed: number }>();
  // deno-lint-ignore no-explicit-any
  for (const t of (tasks ?? []) as any[]) {
    if (t.deliverable_id == null) continue;
    const bucket = unitsByDeliverable.get(t.deliverable_id) ?? { planned: 0, completed: 0 };
    bucket.planned += 1;
    if (t.status === "completed") bucket.completed += 1;
    unitsByDeliverable.set(t.deliverable_id, bucket);
  }

  const startDelays: number[] = [];
  // deno-lint-ignore no-explicit-any
  for (const s of (sessions ?? []) as any[]) {
    const plannedDate = s.tasks.planned_date as LocalDate;
    // B4: mirrors packages/api/src/day/risk.ts -- an evening start must not be filed
    // under the next UTC day, which would inflate every start delay by one.
    const actualDate = localDateFromInstant(new Date(s.actual_start!), timezone);
    startDelays.push(Math.max(0, daysBetween(plannedDate, actualDate)));
  }
  const userMeanStartDelayDays =
    startDelays.length > 0 ? startDelays.reduce((a, b) => a + b, 0) / startDelays.length : undefined;

  const gradeByCourse = new Map(gradeProjections.map((g) => [g.courseId, g.result]));
  const courseById = new Map(courses.map((c) => [c.id, c]));

  // deno-lint-ignore no-explicit-any
  const deliverableRisks: DeliverableRisk[] = ((deliverables ?? []) as any[]).map((d) => {
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
    courseCode: risks[0].courseCode,
    courseName: risks[0].courseName,
    result: computeCourseRisk({ items: risks.map((r) => ({ id: String(r.deliverableId), score: r.result.score })) }),
    itemLabels: Object.fromEntries(risks.map((r) => [String(r.deliverableId), r.title])),
  }));

  return { deliverableRisks, courseRisks };
}

// ============================================================================
// Ported from packages/api/src/day/recoveryMode.ts
// ============================================================================
export async function computeTodayRecoveryMode(
  client: AnySupabaseClient,
  userId: string,
  today: LocalDate,
  sleepBaselineHours: number | null,
  timezone: string,
): Promise<RecoveryModeResult> {
  const yesterday = addDays(today, -1);
  // B4 (mirrors packages/api/src/day/recoveryMode.ts): local midnight, not UTC
  // midnight -- see CLAUDE.md's "never derive a day boundary from UTC."
  const todayStart = new Date(localTimeToInstant(today, 0, 0, timezone));
  const deadlineHorizon = new Date(todayStart);
  deadlineHorizon.setUTCHours(deadlineHorizon.getUTCHours() + HARD_DEADLINE_WINDOW_HOURS);
  const overdueLookbackStart = addDays(today, -7); // matches recoveryMode.ts's OVERDUE_TASK_LOOKBACK_DAYS

  const [
    { data: todayHealth, error: healthError },
    { data: overdueTasks, error: overdueError },
    { data: hardDeadlines, error: deadlineError },
    { data: yesterdayCheckin, error: checkinError },
    { data: yesterdayMits, error: mitError },
    { data: todayCalendar, error: calError },
    { data: compressedBackplans, error: backplanError },
  ] = await Promise.all([
    client.from("health_daily").select("sleep_hours, whoop_recovery_pct").eq("user_id", userId).eq("local_date", today).maybeSingle(),
    client
      .from("tasks")
      .select("id")
      .eq("user_id", userId)
      .gte("planned_date", overdueLookbackStart)
      .lt("planned_date", today)
      .not("status", "in", "(completed,cancelled)"),
    client
      .from("deliverables")
      .select("id")
      .eq("user_id", userId)
      .neq("status", "completed")
      .lte("due_at", deadlineHorizon.toISOString())
      .gte("due_at", todayStart.toISOString()),
    client.from("daily_checkins").select("id").eq("user_id", userId).eq("local_date", yesterday).maybeSingle(),
    client.from("tasks").select("id, status").eq("user_id", userId).eq("planned_date", yesterday).not("mit_rank", "is", null),
    client
      .from("calendar_events")
      .select("start_at, end_at")
      .eq("user_id", userId)
      .eq("is_busy", true)
      .gte("start_at", todayStart.toISOString())
      .lt("start_at", localTimeToInstant(addDays(today, 1), 0, 0, timezone)),
    client
      .from("deliverable_backplans")
      .select("id, deliverables!inner(status)")
      .eq("user_id", userId)
      .eq("compressed", true)
      .neq("deliverables.status", "completed"),
  ]);
  if (healthError) throw healthError;
  if (overdueError) throw overdueError;
  if (deadlineError) throw deadlineError;
  if (checkinError) throw checkinError;
  if (mitError) throw mitError;
  if (calError) throw calError;
  if (backplanError) throw backplanError;

  const committedCalendarHours = (todayCalendar ?? []).reduce(
    // deno-lint-ignore no-explicit-any
    (sum: number, e: any) => sum + Math.max((new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) / (1000 * 60 * 60), 0),
    0,
  );
  // deno-lint-ignore no-explicit-any
  const yesterdayMitCompletionCount = (yesterdayMits ?? []).filter((t: any) => t.status === "completed").length;

  return computeRecoveryModeTrigger({
    sleepHours: todayHealth?.sleep_hours != null ? Number(todayHealth.sleep_hours) : null,
    sleepBaselineHours,
    whoopRecoveryPct: todayHealth?.whoop_recovery_pct != null ? Number(todayHealth.whoop_recovery_pct) : null,
    overdueTaskCount: overdueTasks?.length ?? 0,
    hardDeadlinesWithin48h: hardDeadlines?.length ?? 0,
    missedYesterdayCheckin: yesterdayCheckin == null,
    yesterdayMitCompletionCount,
    committedCalendarHours,
    anyActiveBackplanCompressed: (compressedBackplans?.length ?? 0) > 0,
  });
}

// ============================================================================
// Ported from packages/api/src/day/planningExecution.ts
// ============================================================================
export async function computeHistoricalCapacityP50Min(
  client: AnySupabaseClient,
  userId: string,
  today: LocalDate,
): Promise<number> {
  const lookbackStart = addDays(today, -HISTORICAL_CAPACITY_LOOKBACK_DAYS);
  const { data, error } = await client
    .from("daily_reviews")
    .select("deep_work_actual_min")
    .eq("user_id", userId)
    .gte("local_date", lookbackStart)
    .not("deep_work_actual_min", "is", null);
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  return median((data ?? []).map((h: any) => h.deep_work_actual_min!).filter((v: number) => v != null));
}

/** Generalized from packages/api's "yesterday only" version to accept any `forDate`, since
 *  the nightly report needs the diagnosis for the day it's ABOUT, not always "yesterday
 *  relative to right now" -- the same generalization matters for a future weekly/backfill run. */
export async function computePlanningExecutionForDate(
  client: AnySupabaseClient,
  userId: string,
  forDate: LocalDate,
): Promise<PlanningExecutionResult | null> {
  const [{ data: review, error: reviewError }, historicalCapacityP50Min, { data: sessions, error: sessionError }] =
    await Promise.all([
      client.from("daily_reviews").select("*").eq("user_id", userId).eq("local_date", forDate).maybeSingle(),
      computeHistoricalCapacityP50Min(client, userId, forDate),
      client
        .from("task_sessions")
        .select("planned_start, actual_start, tasks!inner(planned_date, planned_start_at, user_id)")
        .not("tasks.planned_start_at", "is", null)
        .eq("tasks.planned_date", forDate)
        .eq("tasks.user_id", userId)
        .order("planned_start", { ascending: true })
        .limit(1),
    ]);
  if (reviewError) throw reviewError;
  if (sessionError) throw sessionError;

  if (!review) return null;

  const firstSession = sessions?.[0];

  return computePlanningExecutionGap({
    plannedDeepWorkMin: review.deep_work_planned_min ?? 0,
    actualDeepWorkMin: review.deep_work_actual_min ?? 0,
    historicalCapacityP50Min,
    plannedStartMin: firstSession ? minutesSinceMidnightUTC(firstSession.planned_start) : null,
    actualStartMin:
      firstSession?.actual_start != null
        ? actualStartMinFrom(minutesSinceMidnightUTC(firstSession.planned_start), firstSession.planned_start, firstSession.actual_start)
        : null,
    mitPlanned: review.mits_planned,
    mitCompleted: review.mits_completed,
  });
}

// ============================================================================
// Ported from packages/api/src/day/killLoopBounceBack.ts
// ============================================================================
export async function computeHabitBounceBack(
  client: AnySupabaseClient,
  userId: string,
  killHabitId: number,
  today: LocalDate,
  timezone: string,
): Promise<BounceBackResult> {
  const { data: habit, error: habitError } = await client
    .from("kill_habits")
    .select("created_at")
    .eq("id", killHabitId)
    .eq("user_id", userId)
    .single();
  if (habitError) throw habitError;

  // B4: mirrors packages/api/src/day/killLoopBounceBack.ts -- a UTC-sliced start date can
  // exclude day one's kill_events from the series.
  const startDate: LocalDate = localDateFromInstant(new Date(habit.created_at), timezone);

  const { data: events, error: eventsError } = await client
    .from("kill_events")
    .select("local_date, outcome")
    .eq("user_id", userId)
    .eq("kill_habit_id", killHabitId)
    .gte("local_date", startDate)
    .lte("local_date", today);
  if (eventsError) throw eventsError;

  const outcomeByDate = new Map<LocalDate, "success" | "failure">();
  // deno-lint-ignore no-explicit-any
  for (const event of (events ?? []) as any[]) {
    if (event.outcome === "relapsed") {
      outcomeByDate.set(event.local_date, "failure");
    } else if (event.outcome === "resisted" && outcomeByDate.get(event.local_date) !== "failure") {
      outcomeByDate.set(event.local_date, "success");
    }
  }

  const series: DayOutcome[] = [];
  for (let d = startDate; d <= today; d = addDays(d, 1)) {
    series.push({ date: d, outcome: outcomeByDate.get(d) ?? "untracked" });
  }

  return computeBounceBack(series);
}

// ============================================================================
// Ported from packages/api/src/day/frictionAnalytics.ts
// ============================================================================
async function loadFrictionLogs(
  client: AnySupabaseClient,
  userId: string,
  since: LocalDate,
  until: LocalDate,
): Promise<FrictionLog[]> {
  const { data, error } = await client
    .from("friction_logs")
    .select("local_date, cause")
    .eq("user_id", userId)
    .gte("local_date", since)
    .lte("local_date", until);
  if (error) throw error;
  // deno-lint-ignore no-explicit-any
  return (data ?? []).map((row: any) => ({ date: row.local_date, cause: row.cause }));
}

export async function computeUserFrictionDistribution(
  client: AnySupabaseClient,
  userId: string,
  since: LocalDate,
  until: LocalDate,
): Promise<FrictionDistribution> {
  return computeFrictionDistribution(await loadFrictionLogs(client, userId, since, until));
}

export async function computeUserFrictionTrend(
  client: AnySupabaseClient,
  userId: string,
  previousWindow: { since: LocalDate; until: LocalDate },
  currentWindow: { since: LocalDate; until: LocalDate },
): Promise<CauseTrendEntry[]> {
  const [previous, current] = await Promise.all([
    loadFrictionLogs(client, userId, previousWindow.since, previousWindow.until),
    loadFrictionLogs(client, userId, currentWindow.since, currentWindow.until),
  ]);
  return computeFrictionTrend(previous, current);
}
