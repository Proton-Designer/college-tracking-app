import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type AnnouncementRow = Database['public']['Tables']['announcements']['Row'];

/** One change in a staged diff -- mirrors _shared/announcements/parse.ts's Zod union. */
export type AnnouncementChange =
  | {
      kind: 'date_change';
      matchedTitle: string;
      newDueDate: string | null;
      newDueText: string | null;
      sourceSnippet: string;
    }
  | {
      kind: 'new_item';
      title: string;
      itemType: string;
      dueDate: string | null;
      dueText: string | null;
      sourceSnippet: string;
    }
  | { kind: 'note'; text: string; sourceSnippet: string };

export interface AnnouncementDiff {
  changes: AnnouncementChange[];
}

/** Same envelope-unwrap as syllabusExtractions.ts -- functions.invoke's `data` is the
 *  whole {ok,...} envelope, not the payload. */
function unwrapEnvelope<T>(body: unknown): { ok: true; data: T } | { ok: false; error: string } {
  if (body != null && typeof body === 'object' && 'ok' in body) {
    return body as { ok: true; data: T } | { ok: false; error: string };
  }
  return { ok: false, error: 'Malformed response from server.' };
}

export type ParseAnnouncementOutcome =
  | { kind: 'parsed'; announcementId: number; changeCount: number }
  | { kind: 'noSchedulableContent'; announcementId: number };

/** Creates and parses one pasted announcement. A "nothing schedulable" outcome is a
 *  success with its own kind -- the caller must file it quietly, never render an error. */
export async function parseAnnouncementText(
  client: TypedSupabaseClient,
  courseId: number,
  rawText: string,
): Promise<DataResult<ParseAnnouncementOutcome>> {
  const { data, error } = await client.functions.invoke('parse-announcement', {
    method: 'POST',
    body: { courseId, rawText },
  });
  if (error) return dataErr({ code: 'network_error', message: error.message ?? 'Parsing failed. Please try again.' });
  const envelope = unwrapEnvelope<ParseAnnouncementOutcome>(data);
  if (!envelope.ok) return dataErr({ code: 'unknown', message: envelope.error });
  return dataOk(envelope.data);
}

export interface ConfirmAnnouncementApplied {
  applied?: { dateChanges: number; newItems: number; notes: number };
  rejected?: boolean;
}

/** Same confirmation grammar as confirmSyllabusExtraction: the server re-validates an
 *  edited diff against the parser's own schema; it never trusts an edit just because a
 *  user touched it. */
export async function confirmAnnouncement(
  client: TypedSupabaseClient,
  input: {
    announcementId: number;
    decision: 'confirmed' | 'edited' | 'rejected';
    editedDiff?: AnnouncementDiff;
  },
): Promise<DataResult<ConfirmAnnouncementApplied>> {
  const { data, error } = await client.functions.invoke('announcement-confirm', {
    method: 'POST',
    body: input,
  });
  if (error) return dataErr({ code: 'network_error', message: error.message ?? 'Confirm failed. Please try again.' });
  const envelope = unwrapEnvelope<ConfirmAnnouncementApplied>(data);
  if (!envelope.ok) return dataErr({ code: 'unknown', message: envelope.error });
  return dataOk(envelope.data);
}

/** The staged diff for one announcement, read back for the review screen. */
export async function getAnnouncement(
  client: TypedSupabaseClient,
  userId: string,
  announcementId: number,
): Promise<DataResult<AnnouncementRow | null>> {
  const { data, error } = await client
    .from('announcements')
    .select('*')
    .eq('id', announcementId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** A course's announcement history, newest first -- the "filed to the course" record. */
export async function listAnnouncementsForCourse(
  client: TypedSupabaseClient,
  userId: string,
  courseId: number,
): Promise<DataResult<AnnouncementRow[]>> {
  const { data, error } = await client
    .from('announcements')
    .select('*')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}
