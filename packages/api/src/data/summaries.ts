import type { LocalDate } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type DailySummaryRow = Database['public']['Tables']['daily_summaries']['Row'];
export type WeeklySummaryRow = Database['public']['Tables']['weekly_summaries']['Row'];

/** The summary pyramid's daily tier (docs/LLM_LAYER_SPEC.md §5) -- `summary` is the
 *  DailySummaryPayload shape (supabase/functions/_shared/nightly/summaryPyramid.ts).
 *  Populated by the nightly job whether or not the model layer ran that night. */
export async function getDailySummary(
  client: TypedSupabaseClient,
  localDate: LocalDate,
): Promise<DataResult<DailySummaryRow | null>> {
  const { data, error } = await client.from('daily_summaries').select('*').eq('local_date', localDate).maybeSingle();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Most recent `days` daily summaries, chronological (oldest first) -- e.g. a trend
 *  chart. Never raw event history, per §5's "never send raw history" rule. */
export async function listRecentDailySummaries(
  client: TypedSupabaseClient,
  throughDate: LocalDate,
  days: number,
): Promise<DataResult<DailySummaryRow[]>> {
  const { data, error } = await client
    .from('daily_summaries')
    .select('*')
    .lte('local_date', throughDate)
    .order('local_date', { ascending: false })
    .limit(days);
  if (error) return dataErr(mapDataError(error));
  return dataOk((data ?? []).slice().reverse());
}

/** The summary pyramid's weekly tier -- `summary` is the WeeklySynthesisPayload shape. */
export async function getWeeklySummary(
  client: TypedSupabaseClient,
  weekStartDate: LocalDate,
): Promise<DataResult<WeeklySummaryRow | null>> {
  const { data, error } = await client.from('weekly_summaries').select('*').eq('week_start_date', weekStartDate).maybeSingle();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
