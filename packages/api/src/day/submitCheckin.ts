import type { LocalDate } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import { dataErr, dataOk, type DataResult } from '../data/types';
import { mapDataError } from '../data/errors';
import type { DailyCheckin } from '../data/dailyCheckins';
import type { DailyPredictionRow } from './predictions';

export interface SubmitMorningCheckinInput {
  userId: string;
  localDate: LocalDate;
  energy: number;
  mood: number;
  derailmentReason?: string;
  predictedCompletionPct: number;
  expectedEnergyTonight?: number;
  likelyFailureMode?: string;
  hardestTaskId?: number;
  /** Up to 3 task ids, in priority order. Replaces any prior MIT selection for the day. */
  topMitTaskIds: number[];
  capacityMinutes?: number;
  floorMinutes?: number;
  targetMinutes?: number;
  recoveryModeTriggered?: boolean;
  recoveryModeTotal?: number;
}

/**
 * Idempotent: re-submitting for the same (user, local_date) updates the existing rows
 * (upsert on the UNIQUE constraint) and replaces the MIT selection rather than layering
 * duplicates on top of it.
 */
export async function submitMorningCheckin(
  client: TypedSupabaseClient,
  input: SubmitMorningCheckinInput,
): Promise<DataResult<{ checkin: DailyCheckin; prediction: DailyPredictionRow }>> {
  if (input.topMitTaskIds.length > 3) {
    return dataErr({ code: 'validation', message: 'At most 3 MITs may be selected per day.' });
  }

  // Clear any previous MIT selection for the day before applying the new one, so a
  // resubmission never leaves a stale rank on a task that's no longer selected.
  const { error: clearError } = await client
    .from('tasks')
    .update({ mit_rank: null })
    .eq('user_id', input.userId)
    .eq('planned_date', input.localDate)
    .not('mit_rank', 'is', null);
  if (clearError) return dataErr(mapDataError(clearError));

  for (const [index, taskId] of input.topMitTaskIds.entries()) {
    const { error } = await client
      .from('tasks')
      .update({ mit_rank: index + 1 })
      .eq('id', taskId)
      .eq('user_id', input.userId);
    if (error) return dataErr(mapDataError(error));
  }

  const { data: checkin, error: checkinError } = await client
    .from('daily_checkins')
    .upsert(
      {
        user_id: input.userId,
        local_date: input.localDate,
        energy: input.energy,
        mood: input.mood,
        derailment_reason: input.derailmentReason ?? null,
        capacity_minutes: input.capacityMinutes ?? null,
        floor_minutes: input.floorMinutes ?? null,
        target_minutes: input.targetMinutes ?? null,
        recovery_mode_triggered: input.recoveryModeTriggered ?? false,
        recovery_mode_total: input.recoveryModeTotal ?? null,
      },
      { onConflict: 'user_id,local_date' },
    )
    .select()
    .single();
  if (checkinError) return dataErr(mapDataError(checkinError));

  const { data: prediction, error: predictionError } = await client
    .from('daily_predictions')
    .upsert(
      {
        user_id: input.userId,
        local_date: input.localDate,
        predicted_completion_pct: input.predictedCompletionPct,
        expected_energy_tonight: input.expectedEnergyTonight ?? null,
        likely_failure_mode: input.likelyFailureMode ?? null,
        hardest_task_id: input.hardestTaskId ?? null,
      },
      { onConflict: 'user_id,local_date' },
    )
    .select()
    .single();
  if (predictionError) return dataErr(mapDataError(predictionError));

  return dataOk({ checkin, prediction });
}
