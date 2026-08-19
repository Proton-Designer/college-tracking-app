import type { LocalDate } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type DailyCheckin = Database['public']['Tables']['daily_checkins']['Row'];
export type DailyCheckinInsert = Database['public']['Tables']['daily_checkins']['Insert'];

/** null (not an error) when the user hasn't checked in yet today — a real, expected state. */
export async function getCheckinForDate(
  client: TypedSupabaseClient,
  localDate: LocalDate,
): Promise<DataResult<DailyCheckin | null>> {
  const { data, error } = await client
    .from('daily_checkins')
    .select('*')
    .eq('local_date', localDate)
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function upsertCheckin(
  client: TypedSupabaseClient,
  input: DailyCheckinInsert,
): Promise<DataResult<DailyCheckin>> {
  const { data, error } = await client
    .from('daily_checkins')
    .upsert(input, { onConflict: 'user_id,local_date' })
    .select()
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
