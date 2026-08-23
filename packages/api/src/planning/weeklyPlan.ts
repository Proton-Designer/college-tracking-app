import {
  addDays,
  buildWeeklyPlan,
  clipIntervalsToCapacity,
  computeCapacityMinutes,
  daysBetween,
  findFreeIntervals,
  intervalMinutes,
  localTimeToInstant,
  recoveryAdjustmentFromWhoopPct,
  type AcademicLoadBand,
  type BusyEvent,
  type Confidence,
  type DayPlanningInput,
  type LocalDate,
  type RiskBand,
  type WeeklyDeliverableInput,
  type WeeklyPlanResult,
} from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import { dataErr, dataOk, type DataResult } from '../data/types';
import { mapDataError } from '../data/errors';
import { computeRiskAssessment, type DeliverableRisk } from '../day/risk';
import { marginalRiskReduction } from '../day/workload';
import { loadCourseGradeProjections } from '../day/grades';
import { computeHistoricalCapacityP50Min } from '../day/planningExecution';
import type { Course } from '../data/courses';

const WAKING_START_HOUR = 8;
const WAKING_END_HOUR = 23;
const WEEK_LENGTH_DAYS = 7; // inclusive of today -- the week runs [weekStartDate, weekStartDate+6]
const DEFAULT_WAKING_HOURS_PER_DAY = 16;

/** Same fallback and formula as workload.ts's/backplan.ts's own private copies -- each
 *  file that needs this keeps its own tiny local version rather than sharing one, the
 *  established pattern in this codebase for a one-line derivation like this. */
function wakingMinutesPerDayFor(sleepBaselineHours: number | null): number {
  const hours = sleepBaselineHours != null ? Math.max(24 - sleepBaselineHours, 1) : DEFAULT_WAKING_HOURS_PER_DAY;
  return hours * 60;
}

export interface SkippedDeliverable {
  deliverableId: number;
  courseId: number;
  title: string;
  /** Actionable, not just a status -- the fix is always "estimate this," so say so. */
  message: string;
}

export interface WeeklyPlanGenerationResult {
  planId: number;
  plan: WeeklyPlanResult;
  skippedForMissingEstimate: SkippedDeliverable[];
  /** Confidence behind every day's capacity ceiling this plan was built against --
   *  'insufficient' means capacity is based on DEFAULT_HISTORICAL_DEEP_WORK_P50_MINUTES_PRIOR
   *  (a documented prior), not the user's real history yet. Surface this so the UI can
   *  mark the plan "estimated" rather than presenting it as fully measured. */
  capacityConfidence: Confidence;
}

/**
 * Assembles remainingMinutes and a ranking key for one deliverable. Two deliberate design
 * choices, both Lead-reviewed:
 *
 * - remainingMinutes prefers the sum of its OPEN (not completed/cancelled) linked tasks'
 *   estimated_minutes (raw, uncalibrated -- this is a suggestion the user adjusts anyway,
 *   not a committed number the way a backplan's totalEffortMinutes is). Falls back to the
 *   deliverable's own estimated_minutes only when it has no tasks broken out yet. A
 *   deliverable with NEITHER is genuinely unknown-sized and is excluded entirely (see
 *   `skippedForMissingEstimate` below) rather than guessing -- unlike a single task's `??
 *   30` fallback (buildTodayWorkloadItems), a deliverable-level guess is unbounded: a lab
 *   report could be 2 hours or 20, and a fabricated figure would either crowd out real
 *   work or silently under-allocate the biggest thing on the list.
 *
 * - riskReductionPerMinute reuses marginalRiskReduction/rankSuggestedMits's own ranking
 *   rule when real per-task progress exists. When it doesn't (zero open tasks, using the
 *   deliverable-level estimate), that formula is degenerate: computeAssignmentRisk's
 *   `unfinished` factor is 1.0 whenever plannedUnits===0 regardless of completedUnits, so
 *   "completed+1 against 0 planned" changes nothing and marginalRiskReduction always
 *   returns exactly 0 -- not garbage, but not a meaningful priority signal either, and
 *   letting every just-created deliverable rank at the very bottom by construction (not
 *   by actual analysis) would be wrong. Falls back to riskScore/remainingMinutes instead
 *   -- a real, non-degenerate "value per minute" signal for exactly this case.
 */
function assembleWeeklyDeliverable(
  deliverableRisk: DeliverableRisk,
  openTaskMinutesById: Map<number, number>,
  openTaskCountById: Map<number, number>,
  deliverableEstimatedMinutesById: Map<number, number | null>,
): { input: WeeklyDeliverableInput; skipped: SkippedDeliverable | null } {
  const { deliverableId, courseId, title, result } = deliverableRisk;
  const openMinutes = openTaskMinutesById.get(deliverableId) ?? 0;
  const openCount = openTaskCountById.get(deliverableId) ?? 0;

  let remainingMinutes: number;
  let riskReductionPerMinute: number;

  if (openCount > 0) {
    remainingMinutes = openMinutes;
    const minutesPerUnit = remainingMinutes / openCount;
    riskReductionPerMinute = marginalRiskReduction(deliverableRisk) / Math.max(minutesPerUnit, 1e-9);
  } else {
    const deliverableEstimate = deliverableEstimatedMinutesById.get(deliverableId) ?? null;
    if (deliverableEstimate == null) {
      return {
        input: { deliverableId, courseId, dueDate: deliverableRisk.input.dueDate, remainingMinutes: 0, riskScore: result.score, riskReductionPerMinute: 0 },
        skipped: {
          deliverableId,
          courseId,
          title,
          message: `"${title}" has no time estimate and no tasks broken out yet, so it can't be sized for this week's plan -- add an estimate or break it into tasks to include it.`,
        },
      };
    }
    remainingMinutes = deliverableEstimate;
    riskReductionPerMinute = result.score / Math.max(remainingMinutes, 1e-9);
  }

  return {
    input: { deliverableId, courseId, dueDate: deliverableRisk.input.dueDate, remainingMinutes, riskScore: result.score, riskReductionPerMinute },
    skipped: null,
  };
}

function toBusyEvent(startAt: string, endAt: string): BusyEvent {
  return { startAt, endAt };
}

/**
 * Generates the week's plan and REPLACES whatever was there before -- same
 * replace-not-accumulate semantics DATA_MODEL.md section 3 establishes for backplans, not
 * the append-only snapshot pattern. Refuses to run (unless `force`) when any existing
 * block for this week has been touched (status other than 'suggested') -- "you adjust
 * once, the engine carries it forward" means a routine re-generation must never silently
 * discard an edit, same reasoning generateAndPersistBackplan already applies to a
 * completed milestone.
 */
export async function generateAndPersistWeeklyPlan(
  client: TypedSupabaseClient,
  userId: string,
  weekStartDate: LocalDate,
  today: LocalDate,
  options: { force?: boolean } = {},
): Promise<DataResult<WeeklyPlanGenerationResult>> {
  const { data: existingPlan, error: existingPlanError } = await client
    .from('weekly_plans')
    .select('id, weekly_plan_blocks(status)')
    .eq('user_id', userId)
    .eq('week_start_date', weekStartDate)
    .maybeSingle();
  if (existingPlanError) return dataErr(mapDataError(existingPlanError));

  if (existingPlan && !options.force) {
    const hasAdjustedBlock = existingPlan.weekly_plan_blocks?.some((b) => b.status !== 'suggested') ?? false;
    if (hasAdjustedBlock) {
      return dataErr({
        code: 'conflict',
        message: 'This week already has a plan with adjustments you made. Regenerating would discard them -- pass force:true to regenerate anyway.',
      });
    }
  }

  const weekEnd = addDays(weekStartDate, WEEK_LENGTH_DAYS - 1);
  const planStart = today > weekStartDate ? today : weekStartDate; // never plan into the past if generating mid-week

  const { data: profile, error: profileError } = await client.from('profiles').select('timezone, sleep_baseline_hours').eq('id', userId).single();
  if (profileError) return dataErr(mapDataError(profileError));

  const { data: courses, error: coursesError } = await client
    .from('courses')
    .select('id, code, name, difficulty_rating, confidence_rating, target_grade_pct')
    .is('archived_at', null);
  if (coursesError) return dataErr(mapDataError(coursesError));

  const gradeProjections = await loadCourseGradeProjections(client, userId);
  const riskAssessment = await computeRiskAssessment(
    client,
    userId,
    planStart,
    courses as Course[],
    gradeProjections,
    profile.sleep_baseline_hours,
    profile.timezone,
  );

  const openDeliverableIds = riskAssessment.deliverableRisks.map((d) => d.deliverableId);

  // B4: the user's real local week, not UTC midnight -- see CLAUDE.md's "never derive a
  // day boundary from UTC." localTimeToInstant is already used correctly 90 lines below
  // in this same file (the day-capacity loop); it just wasn't reached for here.
  const weekWindowStart = localTimeToInstant(planStart, 0, 0, profile.timezone);
  const weekWindowEnd = localTimeToInstant(addDays(weekEnd, 1), 0, 0, profile.timezone);

  const [{ data: openTasks, error: openTasksError }, { data: deliverableRows, error: deliverableRowsError }, { data: calendarEvents, error: calendarError }, { data: timeboxedTasks, error: timeboxedError }] =
    await Promise.all([
      openDeliverableIds.length > 0
        ? client.from('tasks').select('deliverable_id, estimated_minutes').eq('user_id', userId).in('deliverable_id', openDeliverableIds).not('status', 'in', '(completed,cancelled)')
        : Promise.resolve({ data: [], error: null }),
      openDeliverableIds.length > 0 ? client.from('deliverables').select('id, estimated_minutes').in('id', openDeliverableIds) : Promise.resolve({ data: [], error: null }),
      client.from('calendar_events').select('start_at, end_at').eq('user_id', userId).eq('is_busy', true).gte('start_at', weekWindowStart).lt('start_at', weekWindowEnd),
      client
        .from('tasks')
        .select('planned_start_at, estimated_minutes')
        .eq('user_id', userId)
        .not('planned_start_at', 'is', null)
        .gte('planned_start_at', weekWindowStart)
        .lt('planned_start_at', weekWindowEnd),
    ]);
  if (openTasksError) return dataErr(mapDataError(openTasksError));
  if (deliverableRowsError) return dataErr(mapDataError(deliverableRowsError));
  if (calendarError) return dataErr(mapDataError(calendarError));
  if (timeboxedError) return dataErr(mapDataError(timeboxedError));

  const openTaskMinutesById = new Map<number, number>();
  const openTaskCountById = new Map<number, number>();
  for (const t of openTasks ?? []) {
    if (t.deliverable_id == null) continue;
    openTaskMinutesById.set(t.deliverable_id, (openTaskMinutesById.get(t.deliverable_id) ?? 0) + (t.estimated_minutes ?? 0));
    openTaskCountById.set(t.deliverable_id, (openTaskCountById.get(t.deliverable_id) ?? 0) + 1);
  }
  const deliverableEstimatedMinutesById = new Map<number, number | null>((deliverableRows ?? []).map((d) => [d.id, d.estimated_minutes]));

  const skippedForMissingEstimate: SkippedDeliverable[] = [];
  const weeklyDeliverables: WeeklyDeliverableInput[] = [];
  for (const dr of riskAssessment.deliverableRisks) {
    const { input, skipped } = assembleWeeklyDeliverable(dr, openTaskMinutesById, openTaskCountById, deliverableEstimatedMinutesById);
    if (skipped) {
      skippedForMissingEstimate.push(skipped);
    } else {
      weeklyDeliverables.push(input);
    }
  }

  // Free intervals must subtract BOTH busy calendar events AND tasks the user has
  // already timeboxed to a specific start time -- otherwise the planner would happily
  // schedule a block on top of work already committed to that slot.
  const busyByDate = new Map<LocalDate, BusyEvent[]>();
  const addBusy = (date: LocalDate, event: BusyEvent) => {
    const list = busyByDate.get(date) ?? [];
    list.push(event);
    busyByDate.set(date, list);
  };
  for (const event of calendarEvents ?? []) {
    addBusy(event.start_at.slice(0, 10), toBusyEvent(event.start_at, event.end_at));
  }
  for (const task of timeboxedTasks ?? []) {
    const startAt = task.planned_start_at!;
    const endAt = new Date(new Date(startAt).getTime() + (task.estimated_minutes ?? 30) * 60_000).toISOString();
    addBusy(startAt.slice(0, 10), toBusyEvent(startAt, endAt));
  }

  // Raw free calendar time overstates realistic capacity -- the same recovery/historical-
  // performance ceiling Today's workload view already applies (computeCapacityMinutes)
  // must also bound the weekly plan, or the two would silently disagree about how much
  // work is realistic on a given day. No day-specific future recovery forecast exists, so
  // today's WHOOP reading is applied uniformly across the week -- a known simplification,
  // not a fabrication (there's no data to do better with yet).
  const { data: healthRow, error: healthError } = await client.from('health_daily').select('whoop_recovery_pct').eq('user_id', userId).eq('local_date', today).maybeSingle();
  if (healthError) return dataErr(mapDataError(healthError));
  const recoveryAdjustment = recoveryAdjustmentFromWhoopPct(healthRow?.whoop_recovery_pct ?? null);
  const historicalCapacity = await computeHistoricalCapacityP50Min(client, userId, today);
  const historicalDeepWorkP50Minutes = historicalCapacity.minutes;
  const typicalFreeMinutes = wakingMinutesPerDayFor(profile.sleep_baseline_hours);

  // B4: was `Math.round((new Date(weekEndT00Z) - new Date(planStartT00Z)) / 86_400_000) + 1`
  // -- the same UTC-midnight mistake as everywhere else in this pass, but both operands
  // got the identical wrong offset, so it happened to cancel out and always produced the
  // right count. Correct by luck, not by correctness -- daysBetween is the real,
  // timezone-independent way to diff two LocalDate strings.
  const dayCount = Math.max(0, daysBetween(planStart, weekEnd)) + 1;
  const days: DayPlanningInput[] = Array.from({ length: dayCount }, (_, i) => {
    const date = addDays(planStart, i);
    const dayStart = localTimeToInstant(date, WAKING_START_HOUR, 0, profile.timezone);
    const dayEnd = localTimeToInstant(date, WAKING_END_HOUR, 0, profile.timezone);
    const rawFreeIntervals = findFreeIntervals(dayStart, dayEnd, busyByDate.get(date) ?? []);
    const freeCalendarMinutes = rawFreeIntervals.reduce((sum, iv) => sum + intervalMinutes(iv), 0);
    const capacityMinutes = computeCapacityMinutes({ historicalDeepWorkP50Minutes, recoveryAdjustment, freeCalendarMinutes, typicalFreeMinutes });
    return { date, freeIntervals: clipIntervalsToCapacity(rawFreeIntervals, capacityMinutes) };
  });

  const plan = buildWeeklyPlan({ today: planStart, weekEnd, deliverables: weeklyDeliverables, days });

  // Replace: delete the prior plan (cascades to its blocks and unplaced rows) before
  // inserting the new one, rather than accumulating history -- same reasoning as backplans.
  if (existingPlan) {
    const { error: deleteError } = await client.from('weekly_plans').delete().eq('id', existingPlan.id);
    if (deleteError) return dataErr(mapDataError(deleteError));
  }

  const { data: planRow, error: insertPlanError } = await client
    .from('weekly_plans')
    .insert({
      user_id: userId,
      week_start_date: weekStartDate,
      academic_load: plan.academicLoad,
      total_needed_minutes: Math.round(plan.totalNeededMinutes),
      total_capacity_minutes: Math.round(plan.totalCapacityMinutes),
      has_unplaced_work: plan.hasUnplacedWork,
    })
    .select('id')
    .single();
  if (insertPlanError) return dataErr(mapDataError(insertPlanError));

  if (plan.blocks.length > 0) {
    const { error: blocksError } = await client.from('weekly_plan_blocks').insert(
      plan.blocks.map((b) => ({
        user_id: userId,
        weekly_plan_id: planRow.id,
        deliverable_id: b.deliverableId,
        course_id: b.courseId,
        block_date: b.date,
        start_at: b.startAt,
        end_at: b.endAt,
        minutes: Math.round(b.minutes),
      })),
    );
    if (blocksError) return dataErr(mapDataError(blocksError));
  }

  if (plan.unplaced.length > 0) {
    const { error: unplacedError } = await client.from('weekly_plan_unplaced').insert(
      plan.unplaced.map((u) => ({
        user_id: userId,
        weekly_plan_id: planRow.id,
        deliverable_id: u.deliverableId,
        course_id: u.courseId,
        minutes_needed: Math.round(u.minutesNeeded),
        minutes_placed: Math.round(u.minutesPlaced),
        minutes_shortfall: Math.round(u.minutesShortfall),
        reason: u.reason,
      })),
    );
    if (unplacedError) return dataErr(mapDataError(unplacedError));
  }

  return dataOk({ planId: planRow.id, plan, skippedForMissingEstimate, capacityConfidence: historicalCapacity.confidence });
}

export type WeeklyPlanBlockStatus = 'suggested' | 'confirmed' | 'skipped' | 'completed';

export interface WeeklyPlanBlockView {
  id: number;
  deliverableId: number | null;
  courseId: number | null;
  courseCode: string | null;
  /** Deliverable title -- resolved live below, never persisted on the block. */
  title: string | null;
  blockDate: LocalDate;
  startAt: string;
  endAt: string;
  minutes: number;
  status: WeeklyPlanBlockStatus;
  /** P1: the real task this block became once confirmed -- null until then. */
  taskId: number | null;
}

export interface WeeklyPlanUnplacedView {
  id: number;
  deliverableId: number | null;
  courseId: number | null;
  courseCode: string | null;
  title: string | null;
  minutesNeeded: number;
  minutesPlaced: number;
  minutesShortfall: number;
  reason: 'due_before_window' | 'insufficient_capacity';
}

export interface WeeklyPlanHighestRiskItem {
  deliverableId: number;
  courseCode: string;
  title: string;
  dueDate: LocalDate;
  riskScore: number;
  riskBand: RiskBand;
}

export interface WeeklyPlanCourseAllocation {
  courseId: number;
  courseCode: string;
  minutesAllocated: number;
}

export interface WeeklyPlanView {
  id: number;
  weekStartDate: LocalDate;
  generatedAt: string;
  academicLoad: AcademicLoadBand;
  totalNeededMinutes: number;
  totalCapacityMinutes: number;
  hasUnplacedWork: boolean;
  blocks: WeeklyPlanBlockView[];
  unplaced: WeeklyPlanUnplacedView[];
  /** Ranked highest-risk-first, capped -- source brief's "Highest risk" list. Recomputed
   *  live from the same computeRiskAssessment every risk-aware screen uses, never
   *  persisted: a stored score would go stale the moment a deliverable moves. */
  highestRisk: WeeklyPlanHighestRiskItem[];
  /** Source brief's "Recommended deep-work allocation" -- derived by summing each block's
   *  minutes per course_id, not its own stored figure. */
  courseAllocations: WeeklyPlanCourseAllocation[];
}

const HIGHEST_RISK_LIMIT = 5;

/**
 * Reads back a persisted plan for the given week, or null if none has been generated yet
 * -- that's the empty-state trigger ("generate this week's plan"), not an error. Deliverable
 * titles, course codes, risk ranking and per-course allocation are all resolved/computed
 * here rather than stored on weekly_plan_blocks/weekly_plan_unplaced, so this always
 * reflects the deliverable's CURRENT state (title edits, risk changes) rather than a
 * snapshot from generation time -- the opposite convention from a report/AgentReport,
 * which deliberately freezes values at assembly time. A weekly plan is a live plan the user
 * is still acting on, not an archival record.
 */
export async function getWeeklyPlan(
  client: TypedSupabaseClient,
  userId: string,
  weekStartDate: LocalDate,
  today: LocalDate,
): Promise<DataResult<WeeklyPlanView | null>> {
  const { data: planRow, error: planError } = await client
    .from('weekly_plans')
    .select('id, week_start_date, generated_at, academic_load, total_needed_minutes, total_capacity_minutes, has_unplaced_work')
    .eq('user_id', userId)
    .eq('week_start_date', weekStartDate)
    .maybeSingle();
  if (planError) return dataErr(mapDataError(planError));
  if (!planRow) return dataOk(null);

  const [{ data: blockRows, error: blocksError }, { data: unplacedRows, error: unplacedError }] = await Promise.all([
    client
      .from('weekly_plan_blocks')
      .select('id, deliverable_id, course_id, block_date, start_at, end_at, minutes, status, task_id')
      .eq('weekly_plan_id', planRow.id)
      .order('start_at', { ascending: true }),
    client
      .from('weekly_plan_unplaced')
      .select('id, deliverable_id, course_id, minutes_needed, minutes_placed, minutes_shortfall, reason')
      .eq('weekly_plan_id', planRow.id),
  ]);
  if (blocksError) return dataErr(mapDataError(blocksError));
  if (unplacedError) return dataErr(mapDataError(unplacedError));

  const { data: profile, error: profileError } = await client.from('profiles').select('timezone, sleep_baseline_hours').eq('id', userId).single();
  if (profileError) return dataErr(mapDataError(profileError));

  const { data: courses, error: coursesError } = await client
    .from('courses')
    .select('id, code, name, difficulty_rating, confidence_rating, target_grade_pct')
    .is('archived_at', null);
  if (coursesError) return dataErr(mapDataError(coursesError));

  const gradeProjections = await loadCourseGradeProjections(client, userId);
  const riskAssessment = await computeRiskAssessment(
    client,
    userId,
    today,
    courses as Course[],
    gradeProjections,
    profile.sleep_baseline_hours,
    profile.timezone,
  );
  const riskById = new Map(riskAssessment.deliverableRisks.map((d) => [d.deliverableId, d]));
  const courseCodeById = new Map((courses ?? []).map((c) => [c.id, c.code]));

  const blocks: WeeklyPlanBlockView[] = (blockRows ?? []).map((b) => ({
    id: b.id,
    deliverableId: b.deliverable_id,
    courseId: b.course_id,
    courseCode: b.course_id != null ? (courseCodeById.get(b.course_id) ?? null) : null,
    title: b.deliverable_id != null ? (riskById.get(b.deliverable_id)?.title ?? null) : null,
    blockDate: b.block_date,
    startAt: b.start_at,
    endAt: b.end_at,
    minutes: b.minutes,
    status: b.status as WeeklyPlanBlockStatus,
    taskId: b.task_id,
  }));

  const unplaced: WeeklyPlanUnplacedView[] = (unplacedRows ?? []).map((u) => ({
    id: u.id,
    deliverableId: u.deliverable_id,
    courseId: u.course_id,
    courseCode: u.course_id != null ? (courseCodeById.get(u.course_id) ?? null) : null,
    title: u.deliverable_id != null ? (riskById.get(u.deliverable_id)?.title ?? null) : null,
    minutesNeeded: u.minutes_needed,
    minutesPlaced: u.minutes_placed,
    minutesShortfall: u.minutes_shortfall,
    reason: u.reason as 'due_before_window' | 'insufficient_capacity',
  }));

  const allocByCourseId = new Map<number, number>();
  for (const b of blockRows ?? []) {
    if (b.course_id == null) continue;
    allocByCourseId.set(b.course_id, (allocByCourseId.get(b.course_id) ?? 0) + b.minutes);
  }
  const courseAllocations: WeeklyPlanCourseAllocation[] = [...allocByCourseId.entries()]
    .map(([courseId, minutesAllocated]) => ({ courseId, courseCode: courseCodeById.get(courseId) ?? '—', minutesAllocated }))
    .sort((a, b) => b.minutesAllocated - a.minutesAllocated);

  const planDeliverableIds = new Set<number>();
  for (const b of blockRows ?? []) if (b.deliverable_id != null) planDeliverableIds.add(b.deliverable_id);
  for (const u of unplacedRows ?? []) if (u.deliverable_id != null) planDeliverableIds.add(u.deliverable_id);

  const highestRisk: WeeklyPlanHighestRiskItem[] = [...planDeliverableIds]
    .map((id) => riskById.get(id))
    .filter((d): d is DeliverableRisk => d != null)
    .sort((a, b) => b.result.score - a.result.score)
    .slice(0, HIGHEST_RISK_LIMIT)
    .map((d) => ({
      deliverableId: d.deliverableId,
      courseCode: d.courseCode,
      title: d.title,
      dueDate: d.input.dueDate,
      riskScore: d.result.score,
      riskBand: d.result.band,
    }));

  return dataOk({
    id: planRow.id,
    weekStartDate: planRow.week_start_date,
    generatedAt: planRow.generated_at,
    academicLoad: planRow.academic_load as AcademicLoadBand,
    totalNeededMinutes: planRow.total_needed_minutes,
    totalCapacityMinutes: planRow.total_capacity_minutes,
    hasUnplacedWork: planRow.has_unplaced_work,
    blocks,
    unplaced,
    highestRisk,
    courseAllocations,
  });
}

/** P1's category bucket for a block-generated task -- this codebase's own vocabulary for
 *  this kind of time (deep_work_actual_min, historicalDeepWorkP50Minutes) rather than a
 *  guess at the deliverable's task type, which the block itself doesn't know. */
const WEEKLY_PLAN_TASK_CATEGORY = 'deep_work';

/**
 * P1 (docs/FOLLOWUPS.md): confirming a block used to be a plain status flip nothing outside
 * this module ever read. Now `confirmed` creates a real `tasks` row -- carrying
 * planned_date, planned_start_at, estimated_minutes and the deliverable/course link -- and
 * stores its id back on the block, so Today, the Day Trace and the friction engine all see
 * it. `skipped` cancels that task rather than deleting or orphaning it: "planned, then
 * abandoned" is real data. `suggested`/`completed` (and `skipped` on a block never
 * confirmed) stay a plain status flip, same as before -- neither is asked for by the
 * ratified fix, so neither gets new behavior here.
 *
 * user_id is redundant with RLS by design on every write below: RLS is the backstop, not
 * the only guard, same as every other write in this codebase.
 */
export async function updateWeeklyPlanBlockStatus(
  client: TypedSupabaseClient,
  userId: string,
  blockId: number,
  status: WeeklyPlanBlockStatus,
): Promise<DataResult<null>> {
  const { data: block, error: blockError } = await client
    .from('weekly_plan_blocks')
    .select('id, task_id, deliverable_id, course_id, block_date, start_at, minutes, status')
    .eq('id', blockId)
    .eq('user_id', userId)
    .maybeSingle();
  if (blockError) return dataErr(mapDataError(blockError));
  // No row matched (wrong id, or someone else's block) -- same "zero rows, no error"
  // semantics the plain UPDATE below already had.
  if (!block) return dataOk(null);

  if (status === 'confirmed') return confirmWeeklyPlanBlock(client, userId, block);
  if (status === 'skipped' && block.task_id != null) return skipConfirmedWeeklyPlanBlock(client, userId, block.id, block.task_id);

  const { error } = await client.from('weekly_plan_blocks').update({ status }).eq('id', blockId).eq('user_id', userId);
  if (error) return dataErr(mapDataError(error));
  return dataOk(null);
}

interface BlockForConfirm {
  id: number;
  task_id: number | null;
  deliverable_id: number | null;
  course_id: number | null;
  block_date: string;
  start_at: string;
  minutes: number;
}

/**
 * Idempotent: confirming an already-confirmed block with a live task is a no-op on the
 * task (confirm twice, get one task). If the block was previously skipped -- its task
 * cancelled, not deleted -- re-confirming reactivates that same task rather than minting a
 * second one, so a block never accumulates more than one task across its lifetime.
 */
async function confirmWeeklyPlanBlock(
  client: TypedSupabaseClient,
  userId: string,
  block: BlockForConfirm,
): Promise<DataResult<null>> {
  if (block.task_id != null) {
    const { data: task, error: taskError } = await client.from('tasks').select('status').eq('id', block.task_id).eq('user_id', userId).maybeSingle();
    if (taskError) return dataErr(mapDataError(taskError));
    if (task?.status === 'cancelled') {
      const { error: reactivateError } = await client.from('tasks').update({ status: 'pending' }).eq('id', block.task_id).eq('user_id', userId);
      if (reactivateError) return dataErr(mapDataError(reactivateError));
    }
    const { error } = await client.from('weekly_plan_blocks').update({ status: 'confirmed' }).eq('id', block.id).eq('user_id', userId);
    if (error) return dataErr(mapDataError(error));
    return dataOk(null);
  }

  let title = 'Planned focus block';
  if (block.deliverable_id != null) {
    const { data: deliverable, error: deliverableError } = await client.from('deliverables').select('title').eq('id', block.deliverable_id).maybeSingle();
    if (deliverableError) return dataErr(mapDataError(deliverableError));
    if (deliverable) title = `Work on ${deliverable.title}`;
  }

  const { data: newTask, error: taskInsertError } = await client
    .from('tasks')
    .insert({
      user_id: userId,
      course_id: block.course_id,
      deliverable_id: block.deliverable_id,
      title,
      category: WEEKLY_PLAN_TASK_CATEGORY,
      estimated_minutes: block.minutes,
      planned_date: block.block_date,
      planned_start_at: block.start_at,
      status: 'pending',
    })
    .select('id')
    .single();
  if (taskInsertError) return dataErr(mapDataError(taskInsertError));

  const { error: blockUpdateError } = await client
    .from('weekly_plan_blocks')
    .update({ status: 'confirmed', task_id: newTask.id })
    .eq('id', block.id)
    .eq('user_id', userId);
  if (blockUpdateError) return dataErr(mapDataError(blockUpdateError));
  return dataOk(null);
}

/**
 * Cancels the linked task rather than deleting it -- "planned, then abandoned" is real
 * data the friction engine wants, same reasoning deleteTask's own doc comment gives for why
 * a delete is reserved for a task that was never real. Never touches a task that's already
 * `completed`: the user did the work: skipping the block after the fact must not erase
 * that. Idempotent the same way confirm is -- skipping an already-cancelled task's block
 * again just re-asserts the block's own status.
 */
async function skipConfirmedWeeklyPlanBlock(
  client: TypedSupabaseClient,
  userId: string,
  blockId: number,
  taskId: number,
): Promise<DataResult<null>> {
  const { data: task, error: taskError } = await client.from('tasks').select('status').eq('id', taskId).eq('user_id', userId).maybeSingle();
  if (taskError) return dataErr(mapDataError(taskError));
  if (task && (task.status === 'pending' || task.status === 'in_progress')) {
    const { error: cancelError } = await client.from('tasks').update({ status: 'cancelled' }).eq('id', taskId).eq('user_id', userId);
    if (cancelError) return dataErr(mapDataError(cancelError));
  }

  const { error } = await client.from('weekly_plan_blocks').update({ status: 'skipped' }).eq('id', blockId).eq('user_id', userId);
  if (error) return dataErr(mapDataError(error));
  return dataOk(null);
}
