import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type DeliverableBackplanRow = Database['public']['Tables']['deliverable_backplans']['Row'];
export type BackplanMilestoneRow = Database['public']['Tables']['backplan_milestones']['Row'];

/**
 * The current backplan for one deliverable, or null if none has been generated yet.
 * Read-only -- unlike generateAndPersistBackplan, this never mutates. A deliverable has
 * at most one backplan at a time (generateAndPersistBackplan replaces, never
 * accumulates), so this is a single row, not a list.
 */
export async function getBackplan(
  client: TypedSupabaseClient,
  deliverableId: number,
): Promise<DataResult<DeliverableBackplanRow | null>> {
  const { data, error } = await client
    .from('deliverable_backplans')
    .select('*')
    .eq('deliverable_id', deliverableId)
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Raw milestone rows for one backplan, ordered chronologically. */
export async function listMilestones(
  client: TypedSupabaseClient,
  backplanId: number,
): Promise<DataResult<BackplanMilestoneRow[]>> {
  const { data, error } = await client
    .from('backplan_milestones')
    .select('*')
    .eq('backplan_id', backplanId)
    .order('milestone_date');
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
