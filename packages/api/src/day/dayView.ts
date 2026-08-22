import type { Confidence, LocalDate, MvdPlan, PlanningExecutionResult, RecoveryModeResult, WorkloadLevels } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from '../data/types';
import { mapDataError } from '../data/errors';
import { getUserLocalToday } from './today';
import { loadCalibrationObservations } from './calibration';
import { loadCourseGradeProjections, type CourseGradeProjection } from './grades';
import { computeRiskAssessment, type RiskAssessment } from './risk';
import { computeTodayRecoveryMode } from './recoveryMode';
import { composeMvdPlanForToday } from './mvd';
import { computeHistoricalCapacityP50Min, computeYesterdayPlanningExecution } from './planningExecution';
import { computeTodayWorkload, rankSuggestedMits, type SuggestedMit } from './workload';
import type { DailyCheckin } from '../data/dailyCheckins';
import type { DailyReview } from '../data/dailyReviews';
import type { Profile } from '../data/profiles';
import type { Course } from '../data/courses';
import type { Task } from '../data/tasks';

export type CalendarEvent = Database['public']['Tables']['calendar_events']['Row'];
export type TaskSession = Database['public']['Tables']['task_sessions']['Row'];

export interface TodayHealth {
  sleepHours: number | null;
  whoopRecoveryPct: number | null;
}

export interface DayView {
  today: LocalDate;
  profile: Profile;
  todayCheckin: DailyCheckin | null;
  todayReview: DailyReview | null;
  todayTasks: Task[];
  /** Time-positioned so the UI can place them on an hour axis -- see DESIGN_SYSTEM.md
   *  §6.1 (Day Trace). Class meetings are is_class_meeting=true; everything else on the
   *  calendar is just committed time. */
  todayCalendarEvents: CalendarEvent[];
  /** Planned vs. actual start/duration per session -- the other half of the Day Trace's
   *  planned-vs-executed axis, alongside todayCalendarEvents. */
  todayTaskSessions: TaskSession[];
  /** Already computed internally to drive the workload recovery adjustment; returned so
   *  SCREEN_SPEC §1.2's header readout ("Sleep 7h 19m · Recovery 68") doesn't need its own
   *  query. Null (not zeroed) when no health_daily row exists for today. */
  todayHealth: TodayHealth | null;
  upcomingDeliverables: Array<{ id: number; courseId: number; title: string; dueAt: string; localDueDate: LocalDate }>;
  gradeProjections: CourseGradeProjection[];
  risk: RiskAssessment;
  workload: WorkloadLevels;
  /** Confidence behind `workload.capacityMinutes` -- 'insufficient' means the user has
   *  fewer than 3 days of real deep-work history yet, and capacityMinutes is
   *  DEFAULT_HISTORICAL_DEEP_WORK_P50_MINUTES_PRIOR (a documented prior), not a real
   *  measurement. Never render capacity as a hard fact without checking this first. */
  capacityConfidence: Confidence;
  suggestedMits: SuggestedMit[];
  recoveryMode: RecoveryModeResult;
  /** Only computed when recoveryMode.triggered -- see docs/SCREEN_SPEC.md §1: "Only the
   *  Minimum Viable Day is shown" in recovery mode. Null on a normal day, not an empty plan. */
  mvdPlan: MvdPlan | null;
  yesterdayPlanningExecution: PlanningExecutionResult | null;
}

const DEADLINE_HORIZON_DAYS = 14;

/**
 * One typed call assembling everything a Today screen needs, fully computed by
 * packages/core. If a number here were computed inline instead of via the engine, that
 * would be a bug — see docs/DOMAIN_ENGINE_SPEC.md and the L4 report.
 *
 * Query shape is deliberately batched (Promise.all at each stage) rather than per-item,
 * to avoid N+1 — see risk.ts/workload.ts/calibration.ts for the specific batching.
 */
export async function getDayView(
  client: TypedSupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<DataResult<DayView>> {
  const { data: profile, error: profileError } = await client.from('profiles').select('*').eq('id', userId).single();
  if (profileError) return dataErr(mapDataError(profileError));

  const today = getUserLocalToday(profile.timezone, now);
  const todayStart = new Date(`${today}T00:00:00Z`);
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCDate(todayEnd.getUTCDate() + 1);
  const horizonEnd = new Date(todayStart);
  horizonEnd.setUTCDate(horizonEnd.getUTCDate() + DEADLINE_HORIZON_DAYS);

  const [
    { data: todayCheckin, error: checkinError },
    { data: todayReview, error: reviewError },
    { data: todayTasks, error: taskError },
    { data: todayCalendarEvents, error: calendarEventError },
    { data: todayTaskSessions, error: taskSessionError },
    { data: courses, error: courseError },
    { data: upcomingDeliverables, error: deliverableError },
  ] = await Promise.all([
    client.from('daily_checkins').select('*').eq('user_id', userId).eq('local_date', today).maybeSingle(),
    client.from('daily_reviews').select('*').eq('user_id', userId).eq('local_date', today).maybeSingle(),
    client.from('tasks').select('*').eq('user_id', userId).eq('planned_date', today).order('mit_rank', { nullsFirst: false }),
    client
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId)
      .gte('start_at', todayStart.toISOString())
      .lt('start_at', todayEnd.toISOString())
      .order('start_at'),
    client
      .from('task_sessions')
      .select('*')
      .eq('user_id', userId)
      .gte('planned_start', todayStart.toISOString())
      .lt('planned_start', todayEnd.toISOString())
      .order('planned_start'),
    client.from('courses').select('id, code, name, difficulty_rating, confidence_rating, target_grade_pct').is('archived_at', null),
    client
      .from('deliverables')
      .select('id, course_id, title, due_at, local_due_date')
      .eq('user_id', userId)
      .neq('status', 'completed')
      .lte('due_at', horizonEnd.toISOString())
      .order('due_at'),
  ]);
  if (checkinError) return dataErr(mapDataError(checkinError));
  if (reviewError) return dataErr(mapDataError(reviewError));
  if (taskError) return dataErr(mapDataError(taskError));
  if (calendarEventError) return dataErr(mapDataError(calendarEventError));
  if (taskSessionError) return dataErr(mapDataError(taskSessionError));
  if (courseError) return dataErr(mapDataError(courseError));
  if (deliverableError) return dataErr(mapDataError(deliverableError));

  const gradeProjections = await loadCourseGradeProjections(client, userId);
  const risk = await computeRiskAssessment(
    client,
    userId,
    today,
    courses as Course[],
    gradeProjections,
    profile.sleep_baseline_hours,
  );
  const calibration = await loadCalibrationObservations(client, userId, profile.timezone, now);

  const [recoveryMode, yesterdayPlanningExecution, historicalCapacity] = await Promise.all([
    computeTodayRecoveryMode(client, userId, today, profile.sleep_baseline_hours),
    computeYesterdayPlanningExecution(client, userId, today),
    computeHistoricalCapacityP50Min(client, userId, today),
  ]);

  const { data: healthRow } = await client
    .from('health_daily')
    .select('sleep_hours, whoop_recovery_pct')
    .eq('user_id', userId)
    .eq('local_date', today)
    .maybeSingle();

  const todayHealth: TodayHealth | null = healthRow
    ? {
        sleepHours: healthRow.sleep_hours != null ? Number(healthRow.sleep_hours) : null,
        whoopRecoveryPct: healthRow.whoop_recovery_pct != null ? Number(healthRow.whoop_recovery_pct) : null,
      }
    : null;

  const { levels, items, calibrationByItemId } = await computeTodayWorkload(
    client,
    userId,
    today,
    risk.deliverableRisks,
    calibration,
    historicalCapacity.minutes,
    todayHealth?.whoopRecoveryPct ?? null,
    profile.sleep_baseline_hours,
  );

  const mvdPlan = recoveryMode.triggered
    ? await composeMvdPlanForToday(client, userId, today, risk.deliverableRisks, profile.sleep_baseline_hours)
    : null;

  return dataOk({
    today,
    profile,
    todayCheckin,
    todayReview,
    todayTasks: todayTasks ?? [],
    todayCalendarEvents: todayCalendarEvents ?? [],
    todayTaskSessions: todayTaskSessions ?? [],
    todayHealth,
    upcomingDeliverables: (upcomingDeliverables ?? []).map((d) => ({
      id: d.id,
      courseId: d.course_id,
      title: d.title,
      dueAt: d.due_at,
      localDueDate: d.local_due_date,
    })),
    gradeProjections,
    risk,
    workload: levels,
    capacityConfidence: historicalCapacity.confidence,
    suggestedMits: rankSuggestedMits(items, calibrationByItemId),
    recoveryMode,
    mvdPlan,
    yesterdayPlanningExecution,
  });
}
