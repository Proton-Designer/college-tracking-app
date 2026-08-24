import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type WorryRow = Database['public']['Tables']['worries']['Row'];
export type WorryStatus = 'open' | 'handling' | 'done';

/**
 * The Worry List -- a capture inbox all week, the Anti-Worry Hour's checklist on Monday
 * (BLUEPRINT Part III / IV-B). Capture is deliberately the cheapest write in the app: text
 * in, nothing else asked.
 */

export async function listWorries(
  client: TypedSupabaseClient,
  userId: string,
  statuses: WorryStatus[] = ['open', 'handling'],
): Promise<DataResult<WorryRow[]>> {
  const { data, error } = await client
    .from('worries')
    .select('*')
    .eq('user_id', userId)
    .in('status', statuses)
    .order('created_at', { ascending: true });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

export async function createWorry(
  client: TypedSupabaseClient,
  userId: string,
  text: string,
): Promise<DataResult<WorryRow>> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return dataErr({ code: 'validation', message: 'Write the worry down first.' });
  }
  const { data, error } = await client
    .from('worries')
    .insert({ user_id: userId, text: trimmed })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function setWorryStatus(
  client: TypedSupabaseClient,
  userId: string,
  worryId: number,
  status: WorryStatus,
): Promise<DataResult<WorryRow>> {
  const { data, error } = await client
    .from('worries')
    .update({ status })
    .eq('id', worryId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
