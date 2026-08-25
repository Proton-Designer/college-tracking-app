"use server";

import { revalidatePath } from "next/cache";
import {
  confirmAnnouncement,
  getAnnouncement,
  listDeliverables,
  parseAnnouncementText,
  type AnnouncementChange,
  type AnnouncementDiff,
  type ConfirmAnnouncementApplied,
  type ParseAnnouncementOutcome,
} from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/** Same server-action shape as syllabusActions.ts, and the same backend as mobile: both
 *  surfaces invoke the identical deployed functions with the caller's own JWT, so the
 *  rows this produces are indistinguishable from a phone's -- which is what makes a web
 *  test count as a real end-to-end verification, not a parallel path. */

async function requireUserId(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  return { ok: true, userId: user.id };
}

export interface AnnouncementActionResult<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

export async function parseAnnouncementServerAction(
  courseId: number,
  rawText: string,
): Promise<AnnouncementActionResult<ParseAnnouncementOutcome>> {
  const client = await getServerSupabaseClient();
  const result = await parseAnnouncementText(client, courseId, rawText);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

/** Reads the staged diff back -- the review renders what the SERVER staged, same rule as
 *  mobile's loadAnnouncementDiff. */
export async function loadAnnouncementDiffAction(
  announcementId: number,
): Promise<AnnouncementActionResult<AnnouncementChange[]>> {
  const auth = await requireUserId();
  if (!auth.ok) return { ok: false, error: auth.error };
  const client = await getServerSupabaseClient();
  const result = await getAnnouncement(client, auth.userId, announcementId);
  if (!result.ok) return { ok: false, error: result.error.message };
  const diff = result.data?.parsed_diff as AnnouncementDiff | null;
  if (result.data == null || diff == null) return { ok: false, error: "No staged diff found for that announcement." };
  return { ok: true, data: diff.changes };
}

export async function confirmAnnouncementServerAction(
  courseId: number,
  input: {
    announcementId: number;
    decision: "confirmed" | "edited" | "rejected";
    editedDiff?: AnnouncementDiff;
  },
): Promise<AnnouncementActionResult<ConfirmAnnouncementApplied>> {
  const client = await getServerSupabaseClient();
  const result = await confirmAnnouncement(client, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  // Due dates may have moved; the course page's deliverables and risk are stale.
  revalidatePath(`/courses/${courseId}`);
  return { ok: true, data: result.data };
}

export async function loadDeliverableTitlesAction(
  courseId: number,
): Promise<AnnouncementActionResult<string[]>> {
  const client = await getServerSupabaseClient();
  const result = await listDeliverables(client, courseId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data.filter((d) => d.status !== "completed").map((d) => d.title) };
}
