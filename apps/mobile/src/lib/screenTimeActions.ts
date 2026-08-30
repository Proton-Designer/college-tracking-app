import {
  confirmScreenTimeWeek,
  createScreenTimeUpload,
  listScreenTimeExtractions,
  loadScreenTimeStep,
  triggerScreenTimeParse,
  type ConfirmScreenTimeWeekResult,
  type ScreenTimeExtractionRow,
  type ScreenTimeFieldInput,
  type ScreenTimeStepView,
} from "@collegeos/api";
import { getMobileSupabaseClient } from "./supabase/client";

/**
 * The Sunday review's screen-time step (D51), mobile side. Mirrors web's
 * `app/(app)/review/screenTimeActions.ts`: upload -> parse (stages a proposal) -> confirm (the
 * only write to the real table).
 *
 * Nothing in this file writes `screen_time_weeks` except `confirmScreenTimeWeek`, and that is
 * only ever reached from a confirm gesture.
 */

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function loadScreenTime(userId: string, weekStart: string): Promise<Result<ScreenTimeStepView>> {
  const result = await loadScreenTimeStep(getMobileSupabaseClient(), userId, weekStart);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export interface UploadScreenTimeResult {
  uploadId: number;
  /** Reported separately from the upload: the screenshot genuinely saved even when the reading
   *  could not run (most commonly, no Anthropic key on the server). The screen relays the
   *  server's own words rather than a spinner or a fabricated reading. */
  parse: { ok: true; items: ScreenTimeExtractionRow[] } | { ok: false; error: string };
}

/**
 * Uploads a picked screenshot and runs the reading.
 *
 * `fetch(uri) → blob` is Expo's standard file-to-storage path, the same round trip `importLecture`
 * uses; a screenshot is a fraction of a lecture's size, so nothing here needs the resumable
 * upgrade that one records as its escape hatch.
 */
export async function uploadScreenTime(
  userId: string,
  weekStart: string,
  file: { uri: string; name: string; mimeType?: string },
): Promise<Result<UploadScreenTimeResult>> {
  const client = getMobileSupabaseClient();

  let blob: Blob;
  try {
    const response = await fetch(file.uri);
    blob = await response.blob();
  } catch (err) {
    return { ok: false, error: `Could not read the picked image: ${err instanceof Error ? err.message : String(err)}` };
  }

  const uploadResult = await createScreenTimeUpload(client, userId, {
    weekStartDate: weekStart,
    file: blob,
    fileName: file.name,
    contentType: file.mimeType ?? "image/png",
  });
  if (!uploadResult.ok) return { ok: false, error: uploadResult.error.message };

  const parseResult = await triggerScreenTimeParse(client, uploadResult.data.id);
  if (!parseResult.ok) {
    return { ok: true, data: { uploadId: uploadResult.data.id, parse: { ok: false, error: parseResult.error.message } } };
  }

  const items = await listScreenTimeExtractions(client, uploadResult.data.id);
  return {
    ok: true,
    data: { uploadId: uploadResult.data.id, parse: { ok: true, items: items.ok ? items.data : [] } },
  };
}

/** Confirms the week. A `blocked` outcome is a state of the form, not a failed request — it comes
 *  back as `ok` with the outstanding fields named so the screen can point at them. */
export async function confirmScreenTime(
  userId: string,
  uploadId: number,
  fields: ScreenTimeFieldInput[],
): Promise<Result<ConfirmScreenTimeWeekResult>> {
  const result = await confirmScreenTimeWeek(getMobileSupabaseClient(), userId, { uploadId, fields });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}
