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
 * The "auto-populated actuals" SCREEN_SPEC §3 requires the UI to show before submission
 * -- MIT completion, deep-work minutes, kill-list results, workout status. Everything a
 * client cannot know and must never assert; computed from tasks/sessions/kill_events/health,
 * never trusted from input. `submitNightReview` computes and persists the identical
 * shape via this same function, so a preview can never disagree with what gets stored.
 */
export interface NightReviewDraft {
  mitsPlanned: number;
  mitsCompleted: number;
  deepWorkPlannedMin: number;
  deepWorkActualMin: number;
  screenTimeMin: number | null;
  distractingTimeMin: number | null;
  workoutCompleted: boolean | null;
  killListSuccessCount: number;
  killListTotal: number;
}

async function computeNightReviewDraft(
  client: TypedSupabaseClient,
  userId: string,
  localDate: LocalDate,
): Promise<DataResult<NightReviewDraft>> {
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
      .eq('user_id', userId)
      .eq('planned_date', localDate)
      .not('mit_rank', 'is', null),
    client
      .from('task_sessions')
      .select('planned_duration_min, actual_duration_min, tasks!inner(planned_date, user_id)')
      .eq('tasks.planned_date', localDate)
      .eq('tasks.user_id', userId),
    client
      .from('health_daily')
      .select('workout_completed')
      .eq('user_id', userId)
      .eq('local_date', localDate)
      .maybeSingle(),
    client
      .from('kill_events')
      .select('outcome')
      .eq('user_id', userId)
      .eq('local_date', localDate),
    client
      .from('screen_daily')
      .select('total_screen_min, distracting_min')
      .eq('user_id', userId)
      .eq('local_date', localDate)
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

  return dataOk({
    mitsPlanned,
    mitsCompleted,
    deepWorkPlannedMin,
    deepWorkActualMin,
    screenTimeMin: screenDaily?.total_screen_min ?? null,
    distractingTimeMin: screenDaily?.distracting_min ?? null,
    workoutCompleted: healthDaily?.workout_completed ?? null,
    killListSuccessCount,
    killListTotal,
  });
}

/**
 * Read-only preview of what a night-review submission would auto-populate -- zero
 * writes, zero side effects. SCREEN_SPEC §3 requires these numbers shown BEFORE
 * submission; without this, the only way to see them would be to call
 * submitNightReview itself, silently persisting a review and scoring the morning
 * prediction even if the user backs out. Skipping the night review must cost nothing.
 */
export async function getNightReviewDraft(
  client: TypedSupabaseClient,
  userId: string,
  localDate: LocalDate,
): Promise<DataResult<NightReviewDraft>> {
  return computeNightReviewDraft(client, userId, localDate);
}

/**
 * Same ratio `submitNightReview` scores the morning prediction against, exposed so a
 * pre-submit "so far" readout can never disagree with what actually gets stored --
 * the UI never derives this itself, it only ever reads the shared computation.
 */
export function completionPctFromDraft(draft: NightReviewDraft): number {
  return draft.mitsPlanned > 0 ? (draft.mitsCompleted / draft.mitsPlanned) * 100 : 0;
}

/**
 * "Auto-populated actuals" per the brief: MIT completion, deep-work minutes, kill-list
 * results, and workout status are computed via the same function getNightReviewDraft
 * uses -- never trusted from client input -- so a client can't misreport what actually
 * happened, and the preview can never disagree with what gets stored. Only the
 * reflection text is user-supplied. Idempotent via upsert on (user_id, local_date).
 */
export async function submitNightReview(
  client: TypedSupabaseClient,
  input: SubmitNightReviewInput,
): Promise<DataResult<DailyReview>> {
  const draftResult = await computeNightReviewDraft(client, input.userId, input.localDate);
  if (!draftResult.ok) return draftResult;
  const draft = draftResult.data;

  const { data: review, error: reviewError } = await client
    .from('daily_reviews')
    .upsert(
      {
        user_id: input.userId,
        local_date: input.localDate,
        mits_planned: draft.mitsPlanned,
        mits_completed: draft.mitsCompleted,
        deep_work_planned_min: draft.deepWorkPlannedMin,
        deep_work_actual_min: draft.deepWorkActualMin,
        screen_time_min: draft.screenTimeMin,
        distracting_time_min: draft.distractingTimeMin,
        workout_completed: draft.workoutCompleted,
        kill_list_success_count: draft.killListSuccessCount,
        kill_list_total: draft.killListTotal,
        proud_text: input.proudText ?? null,
        went_wrong_text: input.wentWrongText ?? null,
        important_note_text: input.importantNoteText ?? null,
      },
      { onConflict: 'user_id,local_date' },
    )
    .select()
    .single();
  if (reviewError) return dataErr(mapDataError(reviewError));

  await scorePredictionForDate(client, input.userId, input.localDate, completionPctFromDraft(draft));

  return dataOk(review);
}
