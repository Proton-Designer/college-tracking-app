import type { LocalDate } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from '../data/types';
import { mapDataError } from '../data/errors';

export type DailyPredictionRow = Database['public']['Tables']['daily_predictions']['Row'];

/**
 * The morning's prediction for one day, read-only -- so the night-review screen can
 * display "you predicted X%" against today's actuals without going through
 * scorePredictionForDate (a write). Null if no prediction was made that morning.
 */
export async function getPredictionForDate(
  client: TypedSupabaseClient,
  userId: string,
  localDate: LocalDate,
): Promise<DataResult<DailyPredictionRow | null>> {
  const { data, error } = await client
    .from('daily_predictions')
    .select('*')
    .eq('user_id', userId)
    .eq('local_date', localDate)
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/**
 * Scores the same-day morning prediction against the night's actuals — this is the
 * calibration training signal for the user's own self-assessment (predicted vs actual
 * MIT completion). A no-op (not an error, and no row is written) whenever there is no
 * real prediction to score: either no daily_predictions row exists at all, or one exists
 * but predicted_completion_pct is null (zero MITs were planned that morning, so nothing
 * was predicted). "No prediction was recorded" -- keyed off the stored null, not a
 * fresh MIT-count check here -- is the single definition both submitCheckin.ts and this
 * function agree on, so the two sides can't independently drift on what an empty day
 * means. Scoring a null prediction against a real actual would otherwise manufacture a
 * calibration miss the user never actually made.
 */
export async function scorePredictionForDate(
  client: TypedSupabaseClient,
  userId: string,
  localDate: LocalDate,
  actualCompletionPct: number,
): Promise<DataResult<DailyPredictionRow | null>> {
  const { data: existing, error: fetchError } = await client
    .from('daily_predictions')
    .select('id, predicted_completion_pct')
    .eq('user_id', userId)
    .eq('local_date', localDate)
    .maybeSingle();
  if (fetchError) return dataErr(mapDataError(fetchError));
  if (!existing || existing.predicted_completion_pct == null) return dataOk(null);

  const { data, error } = await client
    .from('daily_predictions')
    .update({ actual_completion_pct: actualCompletionPct, scored_at: new Date().toISOString() })
    .eq('id', existing.id)
    .select()
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
