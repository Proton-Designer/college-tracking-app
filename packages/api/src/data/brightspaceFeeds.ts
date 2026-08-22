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

/** Every Edge Function in this codebase wraps its body in {ok, data} or {ok, error}
 *  (supabase/functions/_shared/http.ts's apiOk/apiErr) -- client.functions.invoke's own
 *  `data` is that whole envelope, not the payload directly (found live in
 *  accountManagement.ts; same fix here). */
function unwrapEnvelope<T>(body: unknown): { ok: true; data: T } | { ok: false; error: string } {
  if (body != null && typeof body === 'object' && 'ok' in body) {
    return body as { ok: true; data: T } | { ok: false; error: string };
  }
  return { ok: false, error: 'Malformed response from server.' };
}

export interface ConfirmIcsEventInput {
  extractionId: number;
  decision: 'confirmed' | 'rejected';
  /** Not knowable from the ICS data alone (a lecture and an assignment-due entry look
   *  the same to a parser) -- an explicit user decision at confirm time, defaulting to
   *  false server-side if omitted. */
  isClassMeeting?: boolean;
  courseId?: number;
}

export type ConfirmIcsEventResult =
  | { action: 'rejected' }
  | { action: 'promoted'; calendarEventId: number };

/** The ONLY path from a staged ics_event_extractions row to a real calendar_events
 *  write -- brightspace-confirm Edge Function, never a direct client write. RLS lets a
 *  user's own client write calendar_events directly, so a client-side confirmation
 *  check would be advisory only; this is the one path that can't be walked around
 *  (supabase/functions/_shared/brightspace/confirm.ts's own header comment). */
export async function confirmIcsEvent(client: TypedSupabaseClient, input: ConfirmIcsEventInput): Promise<DataResult<ConfirmIcsEventResult>> {
  const { data, error } = await client.functions.invoke('brightspace-confirm', {
    method: 'POST',
    body: {
      extractionId: input.extractionId,
      decision: input.decision,
      ...(input.isClassMeeting != null ? { isClassMeeting: input.isClassMeeting } : {}),
      ...(input.courseId != null ? { courseId: input.courseId } : {}),
    },
  });
  if (error) return dataErr({ code: 'network_error', message: error.message ?? 'Could not confirm this event. Please try again.' });
  const envelope = unwrapEnvelope<ConfirmIcsEventResult>(data);
  if (!envelope.ok) return dataErr({ code: 'unknown', message: envelope.error });
  return dataOk(envelope.data);
}
