import type { LocalDate, PlanningExecutionResult, RecoveryModeResult, WorkloadLevels } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import { dataErr, dataOk, type DataResult } from '../data/types';
import { mapDataError } from '../data/errors';
import { getUserLocalToday } from './today';
import { loadCalibrationObservations } from './calibration';
import { loadCourseGradeProjections, type CourseGradeProjection } from './grades';
import { computeRiskAssessment, type RiskAssessment } from './risk';
import { computeTodayRecoveryMode } from './recoveryMode';
import { computeHistoricalCapacityP50Min, computeYesterdayPlanningExecution } from './planningExecution';
import { computeTodayWorkload, rankSuggestedMits, type SuggestedMit } from './workload';
import type { DailyCheckin } from '../data/dailyCheckins';
import type { DailyReview } from '../data/dailyReviews';
import type { Profile } from '../data/profiles';
import type { Course } from '../data/courses';
import type { Task } from '../data/tasks';

export interface DayView {
  today: LocalDate;
  profile: Profile;
  todayCheckin: DailyCheckin | null;
  todayReview: DailyReview | null;
  todayTasks: Task[];
  upcomingDeliverables: Array<{ id: number; courseId: number; title: string; dueAt: string; localDueDate: LocalDate }>;
  gradeProjections: CourseGradeProjection[];
  risk: RiskAssessment;
  workload: WorkloadLevels;
  suggestedMits: SuggestedMit[];
  recoveryMode: RecoveryModeResult;
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
  const horizonEnd = new Date(`${today}T00:00:00Z`);
  horizonEnd.setUTCDate(horizonEnd.getUTCDate() + DEADLINE_HORIZON_DAYS);

  const [
    { data: todayCheckin, error: checkinError },
    { data: todayReview, error: reviewError },
    { data: todayTasks, error: taskError },
    { data: courses, error: courseError },
    { data: upcomingDeliverables, error: deliverableError },
  ] = await Promise.all([
    client.from('daily_checkins').select('*').eq('user_id', userId).eq('local_date', today).maybeSingle(),
    client.from('daily_reviews').select('*').eq('user_id', userId).eq('local_date', today).maybeSingle(),
    client.from('tasks').select('*').eq('user_id', userId).eq('planned_date', today).order('mit_rank', { nullsFirst: false }),
    client.from('courses').select('id, difficulty_rating, confidence_rating, target_grade_pct'),
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

  const [recoveryMode, yesterdayPlanningExecution, historicalCapacityP50Min] = await Promise.all([
    computeTodayRecoveryMode(client, userId, today, profile.sleep_baseline_hours),
    computeYesterdayPlanningExecution(client, userId, today),
    computeHistoricalCapacityP50Min(client, userId, today),
  ]);

  const { data: todayHealth } = await client
    .from('health_daily')
    .select('whoop_recovery_pct')
    .eq('user_id', userId)
    .eq('local_date', today)
    .maybeSingle();

  const { levels, items } = await computeTodayWorkload(
    client,
    userId,
    today,
    risk.deliverableRisks,
    calibration,
    historicalCapacityP50Min,
    todayHealth?.whoop_recovery_pct != null ? Number(todayHealth.whoop_recovery_pct) : null,
    profile.sleep_baseline_hours,
  );

  return dataOk({
    today,
    profile,
    todayCheckin,
    todayReview,
    todayTasks: todayTasks ?? [],
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
    suggestedMits: rankSuggestedMits(items),
    recoveryMode,
    yesterdayPlanningExecution,
  });
}
