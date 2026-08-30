"use server";

import { revalidatePath } from "next/cache";
import {
  confirmScreenTimeWeek,
  createScreenTimeUpload,
  listScreenTimeExtractions,
  triggerScreenTimeParse,
  type ConfirmScreenTimeWeekResult,
  type ScreenTimeExtractionRow,
  type ScreenTimeFieldInput,
} from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The Sunday review's screen-time step (D51), server side.
 *
 * The pipeline is the syllabus one, unchanged in shape: upload -> parse (stages a proposal) ->
 * confirm (the only write to the real table). Nothing in this file writes `screen_time_weeks`
 * except `confirmScreenTimeWeek`, and that is only ever reached from a confirm gesture.
 */

async function requireUser() {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  return { ok: true as const, client, userId: user.id };
}

export type UploadScreenTimeResult =
  | {
      ok: true;
      uploadId: number;
      /** The parse is reported separately from the upload, because the upload genuinely
       *  succeeded even when the reading could not run. The surface then offers manual entry
       *  instead of a spinner or a fabricated reading. */
      parse: { ok: true; items: ScreenTimeExtractionRow[] } | { ok: false; error: string };
    }
  | { ok: false; error: string };

/** Uploads this week's screenshot and runs the reading. Re-uploading a week replaces its
 *  staging; the confirmed series is separate and survives. */
export async function uploadScreenTimeAction(
  formData: FormData,
  weekStartDate: string,
): Promise<UploadScreenTimeResult> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a PNG or JPEG screenshot first." };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const uploadResult = await createScreenTimeUpload(caller.client, caller.userId, {
    weekStartDate,
    file: bytes,
    fileName: file.name,
    contentType: file.type || "image/png",
  });
  if (!uploadResult.ok) return { ok: false, error: uploadResult.error.message };

  const parseResult = await triggerScreenTimeParse(caller.client, uploadResult.data.id);
  revalidatePath("/review");
  if (!parseResult.ok) {
    return { ok: true, uploadId: uploadResult.data.id, parse: { ok: false, error: parseResult.error.message } };
  }

  const items = await listScreenTimeExtractions(caller.client, uploadResult.data.id);
  return {
    ok: true,
    uploadId: uploadResult.data.id,
    parse: { ok: true, items: items.ok ? items.data : [] },
  };
}

export type ConfirmScreenTimeActionResult =
  | { ok: true; data: ConfirmScreenTimeWeekResult }
  | { ok: false; error: string };

/**
 * Confirms the week.
 *
 * A `blocked` outcome comes back as `ok: true` with the outstanding fields named, NOT as an error:
 * "you still have two values to fill in" is a state of the form, not a failure of the request, and
 * the surface points at those fields rather than showing a refusal.
 */
export async function confirmScreenTimeAction(
  uploadId: number,
  fields: ScreenTimeFieldInput[],
): Promise<ConfirmScreenTimeActionResult> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await confirmScreenTimeWeek(caller.client, caller.userId, { uploadId, fields });
  if (!result.ok) return { ok: false, error: result.error.message };
  if (result.data.kind === "confirmed") revalidatePath("/review");
  return { ok: true, data: result.data };
}
