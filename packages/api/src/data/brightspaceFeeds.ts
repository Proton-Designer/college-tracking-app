import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type BrightspaceFeedRow = Database['public']['Tables']['brightspace_feeds']['Row'];
export type IcsEventExtractionRow = Database['public']['Tables']['ics_event_extractions']['Row'];

/** Whether the user has a Brightspace feed connected at all, and when it last synced --
 *  never the feed URL itself (Vault-backed, migration 0017; only readable through the
 *  brightspace-sync Edge Function's own service-side call, never this table directly). */
export async function getBrightspaceFeedStatus(client: TypedSupabaseClient): Promise<DataResult<Pick<BrightspaceFeedRow, 'id' | 'last_synced_at'> | null>> {
  const { data, error } = await client.from('brightspace_feeds').select('id, last_synced_at').maybeSingle();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Stores (or replaces) the user's Brightspace iCal feed URL via the store_brightspace_
 *  feed_url RPC -- the URL goes straight into Vault, never through a plaintext column
 *  this client could read back (migration 0017). This is the connect action. */
export async function connectBrightspaceFeed(client: TypedSupabaseClient, userId: string, icsUrl: string): Promise<DataResult<number>> {
  const { data, error } = await client.rpc('store_brightspace_feed_url', { p_user_id: userId, p_ics_url: icsUrl });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Deletes the underlying Vault secret (migration 0029), cascading away the
 *  brightspace_feeds row -- a real disconnect, not a status flip. */
export async function disconnectBrightspaceFeed(client: TypedSupabaseClient, userId: string): Promise<DataResult<boolean>> {
  const { data, error } = await client.rpc('disconnect_brightspace_feed', { p_user_id: userId });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? false);
}

/** Staged events awaiting a confirm/reject decision -- what the confirmation UI reads.
 *  Actually confirming or rejecting one only ever happens through the
 *  brightspace-confirm Edge Function (the same "one path to done" syllabus-confirm
 *  establishes), never a direct write from here. */
export async function listPendingIcsEvents(client: TypedSupabaseClient): Promise<DataResult<IcsEventExtractionRow[]>> {
  const { data, error } = await client.from('ics_event_extractions').select('*').eq('status', 'pending').order('start_at');
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
