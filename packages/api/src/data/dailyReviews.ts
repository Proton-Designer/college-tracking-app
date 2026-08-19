import type { LocalDate } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type DailyReview = Database['public']['Tables']['daily_reviews']['Row'];
export type DailyReviewInsert = Database['public']['Tables']['daily_reviews']['Insert'];

export async function getReviewForDate(
  client: TypedSupabaseClient,
  localDate: LocalDate,
): Promise<DataResult<DailyReview | null>> {
  const { data, error } = await client
    .from('daily_reviews')
    .select('*')
    .eq('local_date', localDate)
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function upsertReview(
  client: TypedSupabaseClient,
  input: DailyReviewInsert,
): Promise<DataResult<DailyReview>> {
  const { data, error } = await client
    .from('daily_reviews')
    .upsert(input, { onConflict: 'user_id,local_date' })
    .select()
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
