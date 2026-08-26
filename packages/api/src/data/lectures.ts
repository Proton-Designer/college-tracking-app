import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';
import { invokeEdgeFunction } from './invoke';

export type LectureTranscriptRow = Database['public']['Tables']['lecture_transcripts']['Row'];

/** Owner-prefixed object path for a new lecture upload -- the storage RLS contract. */
export function buildLectureStoragePath(userId: string, fileName: string): string {
  const safeName = fileName.replace(/[^A-Za-z0-9._-]/g, '_').slice(-80);
  return `${userId}/${crypto.randomUUID()}-${safeName}`;
}

/** Fire-and-return: creates the transcript row (status 'processing') and submits the
 *  uploaded audio to Deepgram. The webhook settles the row later. */
export async function requestLectureTranscription(
  client: TypedSupabaseClient,
  input: { courseId: number; lectureDate: string; storagePath: string },
): Promise<DataResult<{ transcriptId: number; status: string }>> {
  return invokeEdgeFunction<{ transcriptId: number; status: string }>(client, 'lecture-transcribe', input);
}

export async function listLectureTranscripts(
  client: TypedSupabaseClient,
  userId: string,
  courseId: number,
): Promise<DataResult<LectureTranscriptRow[]>> {
  const { data, error } = await client
    .from('lecture_transcripts')
    .select('*')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .order('lecture_date', { ascending: false });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

export async function getLectureTranscript(
  client: TypedSupabaseClient,
  userId: string,
  transcriptId: number,
): Promise<DataResult<LectureTranscriptRow | null>> {
  const { data, error } = await client
    .from('lecture_transcripts')
    .select('*')
    .eq('user_id', userId)
    .eq('id', transcriptId)
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Deletes the raw audio for a READY transcript -- user-initiated only, never
 *  automatic (the recording is the user's property; the spec's retention rule). The
 *  transcript row survives with audio_deleted=true. */
export async function deleteLectureAudio(
  client: TypedSupabaseClient,
  userId: string,
  transcript: Pick<LectureTranscriptRow, 'id' | 'status' | 'storage_path' | 'audio_deleted'>,
): Promise<DataResult<boolean>> {
  if (transcript.status !== 'ready') {
    return dataErr({ code: 'validation', message: 'The audio can be deleted once the transcript is ready — not before.' });
  }
  if (transcript.audio_deleted) return dataOk(true);
  const { error: removeError } = await client.storage.from('lectures').remove([transcript.storage_path]);
  if (removeError) return dataErr({ code: 'unknown', message: removeError.message });
  const { error: flagError } = await client
    .from('lecture_transcripts')
    .update({ audio_deleted: true })
    .eq('id', transcript.id)
    .eq('user_id', userId);
  if (flagError) return dataErr(mapDataError(flagError));
  return dataOk(true);
}
