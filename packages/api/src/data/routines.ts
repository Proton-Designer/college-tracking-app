import type { LocalDate } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type RoutineRow = Database['public']['Tables']['routines']['Row'];
export type RoutineType = 'morning' | 'night';

export interface RoutineItemState {
  key: string;
  done: boolean;
}

function parseItems(row: RoutineRow | null): RoutineItemState[] {
  if (row == null || !Array.isArray(row.items)) return [];
  const items: RoutineItemState[] = [];
  for (const raw of row.items as unknown[]) {
    if (typeof raw === 'object' && raw !== null && 'key' in raw && typeof (raw as { key: unknown }).key === 'string') {
      items.push({ key: (raw as { key: string }).key, done: (raw as { done?: unknown }).done === true });
    }
  }
  return items;
}

/** The day's ticked routine items. Empty array when the day has no row yet. */
export async function getRoutineItems(
  client: TypedSupabaseClient,
  userId: string,
  localDate: LocalDate,
  type: RoutineType,
): Promise<DataResult<RoutineItemState[]>> {
  const { data, error } = await client
    .from('routines')
    .select('*')
    .eq('user_id', userId)
    .eq('local_date', localDate)
    .eq('type', type)
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  return dataOk(parseItems(data));
}

/**
 * Toggles one item. Read-modify-write on the day's jsonb snapshot, upserting the row on
 * first tick. Last write wins on a same-instant race from two devices -- acceptable for a
 * personal checklist, and the alternative (a child table per item) buys serialization this
 * data will never need.
 */
export async function setRoutineItem(
  client: TypedSupabaseClient,
  userId: string,
  localDate: LocalDate,
  type: RoutineType,
  key: string,
  done: boolean,
): Promise<DataResult<RoutineItemState[]>> {
  const current = await getRoutineItems(client, userId, localDate, type);
  if (!current.ok) return current;

  const items = current.data.filter((i) => i.key !== key);
  items.push({ key, done });
  // Structurally identical to Json, but the interface lacks the index signature the
  // generated Json type demands -- mapped rather than cast so a future non-Json field on
  // RoutineItemState becomes a type error here instead of silently serialising.
  const itemsJson = items.map((i) => ({ key: i.key, done: i.done }));

  const { data, error } = await client
    .from('routines')
    .upsert(
      { user_id: userId, local_date: localDate, type, items: itemsJson },
      { onConflict: 'user_id,local_date,type' },
    )
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(parseItems(data));
}
