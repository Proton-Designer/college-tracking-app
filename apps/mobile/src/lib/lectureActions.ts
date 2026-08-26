import {
  buildLectureStoragePath,
  deleteLectureAudio,
  getLectureTranscript,
  listLectureTranscripts,
  requestLectureTranscription,
  type LectureTranscriptRow,
} from "@collegeos/api";
import { getMobileSupabaseClient } from "./supabase/client";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function loadLectures(userId: string, courseId: number): Promise<Result<LectureTranscriptRow[]>> {
  const result = await listLectureTranscripts(getMobileSupabaseClient(), userId, courseId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export async function loadLectureTranscript(userId: string, transcriptId: number): Promise<Result<LectureTranscriptRow | null>> {
  const result = await getLectureTranscript(getMobileSupabaseClient(), userId, transcriptId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

/**
 * Upload + submit, one action: the picked file streams to the private lectures bucket
 * under the owner prefix, then lecture-transcribe takes over. The blob round-trip
 * (fetch(uri) → blob) is Expo's standard file-to-storage path; a 50 MB lecture briefly
 * costs that much memory — acceptable for import, and the TUS resumable upgrade is
 * recorded in the handover as the known better (spec's own preference) if imports of
 * 2-hour recordings start failing on older devices.
 */
export async function importLecture(
  userId: string,
  courseId: number,
  lectureDate: string,
  file: { uri: string; name: string; mimeType?: string },
): Promise<Result<{ transcriptId: number }>> {
  const client = getMobileSupabaseClient();
  const path = buildLectureStoragePath(userId, file.name);

  let blob: Blob;
  try {
    const response = await fetch(file.uri);
    blob = await response.blob();
  } catch (err) {
    return { ok: false, error: `Could not read the picked file: ${err instanceof Error ? err.message : String(err)}` };
  }

  const { error: uploadError } = await client.storage
    .from("lectures")
    .upload(path, blob, { contentType: file.mimeType ?? "audio/mp4" });
  if (uploadError) return { ok: false, error: `Upload failed: ${uploadError.message}` };

  const result = await requestLectureTranscription(client, { courseId, lectureDate, storagePath: path });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: { transcriptId: result.data.transcriptId } };
}

export async function deleteAudio(userId: string, transcript: LectureTranscriptRow): Promise<Result<boolean>> {
  const result = await deleteLectureAudio(getMobileSupabaseClient(), userId, transcript);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}
