import type { LocalDate } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from '../data/types';
import { mapDataError } from '../data/errors';
import type { DailyCheckin } from '../data/dailyCheckins';
import type { DailyPredictionRow } from './predictions';

type TaskUpdate = Database['public']['Tables']['tasks']['Update'];

/** A MIT's optional implementation intention -- "when, where" -- the brief's own phrase
 *  for what separates a plan that outperforms a vague one. Both fields optional
 *  independently: a time with no location, or vice versa, is still a real improvement
 *  over neither. `null` explicitly clears an existing value (the user set a time, then
 *  changed their mind); `undefined`/omitted leaves whatever the task already has
 *  untouched -- same three-state (set / clear / leave alone) shape the rest of this
 *  schema uses for optional writes. */
export interface MitTimebox {
  /** ISO instant. Never defaulted when absent (SCREEN_SPEC §2): a fabricated start time
   *  would manufacture a start delay against a plan the user never actually made, the
   *  same null-vs-zero rule already applied to targetAchieved and startDelayMin. */
  plannedStartAt?: string | null;
  plannedLocation?: string | null;
}

export interface SubmitMorningCheckinInput {
  userId: string;
  localDate: LocalDate;
  energy: number;
  mood: number;
  derailmentReason?: string;
  /** A claim about work -- with zero MITs planned there is no work and no claim, so this
   *  is always written as null in that case regardless of what's passed here (never
   *  trusted from the caller, same discipline as the recovery_coach lens enforcement).
   *  Omit/undefined and null are equivalent inputs; both mean "no prediction." */
  predictedCompletionPct?: number | null;
  expectedEnergyTonight?: number;
  likelyFailureMode?: string;
  hardestTaskId?: number;
  /** Up to 3 task ids, in priority order. Replaces any prior MIT selection for the day. */
  topMitTaskIds: number[];
  /** Optional per-task timebox, keyed by task id -- a strict subset of topMitTaskIds.
   *  Most mornings this is empty or absent entirely: checking in must stay roughly a
   *  minute (SCREEN_SPEC §2), and forcing a time on every MIT would be exactly the kind
   *  of friction that gets a daily ritual abandoned. A task with no entry here keeps
   *  whatever planned_start_at/planned_location it already had (or null, if it never had
   *  one) -- this only ever ADDS or CHANGES a timebox, never silently clears one. */
  mitTimeboxes?: Record<number, MitTimebox>;
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
    const timebox = input.mitTimeboxes?.[taskId];
    const updates: TaskUpdate = { mit_rank: index + 1 };
    // Only touch these columns when the caller actually supplied a key for this task --
    // `undefined`/absent must leave whatever the task already has alone, never silently
    // clear a timebox that wasn't part of this submission.
    if (timebox && 'plannedStartAt' in timebox) updates.planned_start_at = timebox.plannedStartAt ?? null;
    if (timebox && 'plannedLocation' in timebox) updates.planned_location = timebox.plannedLocation ?? null;

    const { error } = await client.from('tasks').update(updates).eq('id', taskId).eq('user_id', input.userId);
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

  // Zero MITs planned means there is no work to predict against -- force null
  // regardless of what the caller sent, rather than trusting a client that might not be
  // running the version of the UI that stopped defaulting this to 80.
  const predictedCompletionPct = input.topMitTaskIds.length > 0 ? (input.predictedCompletionPct ?? null) : null;

  const { data: prediction, error: predictionError } = await client
    .from('daily_predictions')
    .upsert(
      {
        user_id: input.userId,
        local_date: input.localDate,
        predicted_completion_pct: predictedCompletionPct,
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
