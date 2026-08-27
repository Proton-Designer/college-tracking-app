"use server";

import { revalidatePath } from "next/cache";
import {
  buildLectureStoragePath,
  deleteLectureAudio,
  requestLectureTranscription,
  type LectureTranscriptRow,
} from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface LecturesActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function requireUser() {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  return { ok: true as const, client, userId: user.id };
}

/**
 * Upload + submit, one action -- same shape as mobile's importLecture: the picked file
 * streams to the private lectures bucket under the owner prefix, then lecture-transcribe
 * takes over. `lectureDate` names the source anchor (when the professor spoke), never
 * inferred from the file's own timestamp (that's when it was exported, not spoken).
 */
export async function importLectureAction(
  formData: FormData,
  courseId: number,
  lectureDate: string,
): Promise<LecturesActionResult<{ transcriptId: number }>> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose an audio file first." };

  const path = buildLectureStoragePath(caller.userId, file.name);
  const { error: uploadError } = await caller.client.storage
    .from("lectures")
    .upload(path, file, { contentType: file.type || "audio/mp4" });
  if (uploadError) return { ok: false, error: `Upload failed: ${uploadError.message}` };

  const result = await requestLectureTranscription(caller.client, { courseId, lectureDate, storagePath: path });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/lectures");
  return { ok: true, data: { transcriptId: result.data.transcriptId } };
}

/** User-initiated only, never automatic -- the recording is the user's property. Can
 *  only run once the transcript is 'ready' (deleteLectureAudio's own rule). */
export async function deleteLectureAudioAction(
  transcript: Pick<LectureTranscriptRow, "id" | "status" | "storage_path" | "audio_deleted">,
): Promise<LecturesActionResult> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await deleteLectureAudio(caller.client, caller.userId, transcript);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/lectures");
  return { ok: true };
}
