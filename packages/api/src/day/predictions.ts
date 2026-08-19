import type { LocalDate } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from '../data/types';
import { mapDataError } from '../data/errors';

export type DailyPredictionRow = Database['public']['Tables']['daily_predictions']['Row'];

/**
 * Scores the same-day morning prediction against the night's actuals — this is the
 * calibration training signal for the user's own self-assessment (predicted vs actual
 * MIT completion). A no-op (not an error) if no prediction was made that morning.
 */
export async function scorePredictionForDate(
  client: TypedSupabaseClient,
  userId: string,
  localDate: LocalDate,
  actualCompletionPct: number,
): Promise<DataResult<DailyPredictionRow | null>> {
  const { data: existing, error: fetchError } = await client
    .from('daily_predictions')
    .select('id')
    .eq('user_id', userId)
    .eq('local_date', localDate)
    .maybeSingle();
  if (fetchError) return dataErr(mapDataError(fetchError));
  if (!existing) return dataOk(null);

  const { data, error } = await client
    .from('daily_predictions')
    .update({ actual_completion_pct: actualCompletionPct, scored_at: new Date().toISOString() })
    .eq('id', existing.id)
    .select()
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
