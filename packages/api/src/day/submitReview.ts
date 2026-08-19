import type { LocalDate } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import { dataErr, dataOk, type DataResult } from '../data/types';
import { mapDataError } from '../data/errors';
import type { DailyReview } from '../data/dailyReviews';
import { scorePredictionForDate } from './predictions';

export interface SubmitNightReviewInput {
  userId: string;
  localDate: LocalDate;
  /** Structured failure reasons and free reflection — never auto-populated. */
  proudText?: string;
  wentWrongText?: string;
  importantNoteText?: string;
}

/**
 * "Auto-populated actuals" per the brief: MIT completion, deep-work minutes, kill-list
 * results, and workout status are computed HERE from tasks/sessions/kill_events/health —
 * never trusted from client input — so a client can't misreport what actually happened.
 * Only the reflection text is user-supplied. Idempotent via upsert on (user_id, local_date).
 */
export async function submitNightReview(
  client: TypedSupabaseClient,
  input: SubmitNightReviewInput,
): Promise<DataResult<DailyReview>> {
  const [
    { data: mitTasks, error: mitError },
    { data: sessions, error: sessionError },
    { data: healthDaily, error: healthError },
    { data: killEvents, error: killError },
    { data: screenDaily, error: screenError },
  ] = await Promise.all([
    client
      .from('tasks')
      .select('status')
      .eq('user_id', input.userId)
      .eq('planned_date', input.localDate)
      .not('mit_rank', 'is', null),
    client
      .from('task_sessions')
      .select('planned_duration_min, actual_duration_min, tasks!inner(planned_date, user_id)')
      .eq('tasks.planned_date', input.localDate)
      .eq('tasks.user_id', input.userId),
    client
      .from('health_daily')
      .select('workout_completed')
      .eq('user_id', input.userId)
      .eq('local_date', input.localDate)
      .maybeSingle(),
    client
      .from('kill_events')
      .select('outcome')
      .eq('user_id', input.userId)
      .eq('local_date', input.localDate),
    client
      .from('screen_daily')
      .select('total_screen_min, distracting_min')
      .eq('user_id', input.userId)
      .eq('local_date', input.localDate)
      .maybeSingle(),
  ]);
  if (mitError) return dataErr(mapDataError(mitError));
  if (sessionError) return dataErr(mapDataError(sessionError));
  if (healthError) return dataErr(mapDataError(healthError));
  if (killError) return dataErr(mapDataError(killError));
  if (screenError) return dataErr(mapDataError(screenError));

  const mitsPlanned = mitTasks?.length ?? 0;
  const mitsCompleted = (mitTasks ?? []).filter((t) => t.status === 'completed').length;

  const deepWorkPlannedMin = (sessions ?? []).reduce((sum, s) => sum + s.planned_duration_min, 0);
  const deepWorkActualMin = (sessions ?? []).reduce((sum, s) => sum + (s.actual_duration_min ?? 0), 0);

  const killListTotal = killEvents?.length ?? 0;
  const killListSuccessCount = (killEvents ?? []).filter((e) => e.outcome === 'resisted').length;

  const { data: review, error: reviewError } = await client
    .from('daily_reviews')
    .upsert(
      {
        user_id: input.userId,
        local_date: input.localDate,
        mits_planned: mitsPlanned,
        mits_completed: mitsCompleted,
        deep_work_planned_min: deepWorkPlannedMin,
        deep_work_actual_min: deepWorkActualMin,
        screen_time_min: screenDaily?.total_screen_min ?? null,
        distracting_time_min: screenDaily?.distracting_min ?? null,
        workout_completed: healthDaily?.workout_completed ?? null,
        kill_list_success_count: killListSuccessCount,
        kill_list_total: killListTotal,
        proud_text: input.proudText ?? null,
        went_wrong_text: input.wentWrongText ?? null,
        important_note_text: input.importantNoteText ?? null,
      },
      { onConflict: 'user_id,local_date' },
    )
    .select()
    .single();
  if (reviewError) return dataErr(mapDataError(reviewError));

  const actualCompletionPct = mitsPlanned > 0 ? (mitsCompleted / mitsPlanned) * 100 : 0;
  await scorePredictionForDate(client, input.userId, input.localDate, actualCompletionPct);

  return dataOk(review);
}
