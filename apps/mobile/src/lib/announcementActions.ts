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
import { getMobileSupabaseClient } from "./supabase/client";

export async function parseAnnouncementAction(
  _userId: string,
  courseId: number,
  rawText: string,
): Promise<{ ok: true; data: ParseAnnouncementOutcome } | { ok: false; error: string }> {
  const result = await parseAnnouncementText(getMobileSupabaseClient(), courseId, rawText);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

/** Reads the staged diff back for review. The screen renders what the SERVER staged, not
 *  what the parse response claimed -- one source of truth for what will be applied. */
export async function loadAnnouncementDiff(
  userId: string,
  announcementId: number,
): Promise<{ ok: true; data: AnnouncementChange[] } | { ok: false; error: string }> {
  const result = await getAnnouncement(getMobileSupabaseClient(), userId, announcementId);
  if (!result.ok) return { ok: false, error: result.error.message };
  const diff = result.data?.parsed_diff as AnnouncementDiff | null;
  if (result.data == null || diff == null) return { ok: false, error: "No staged diff found for that announcement." };
  return { ok: true, data: diff.changes };
}

export async function confirmAnnouncementAction(
  _userId: string,
  input: {
    announcementId: number;
    decision: "confirmed" | "edited" | "rejected";
    editedDiff?: AnnouncementDiff;
  },
): Promise<{ ok: true; data: ConfirmAnnouncementApplied } | { ok: false; error: string }> {
  const result = await confirmAnnouncement(getMobileSupabaseClient(), input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

/** Open deliverable titles for the matched-title Select on date_change rows. */
export async function loadCourseDeliverableTitles(
  _userId: string,
  courseId: number,
): Promise<{ ok: true; data: string[] } | { ok: false; error: string }> {
  // listDeliverables takes no userId -- RLS scopes the query to the caller.
  const result = await listDeliverables(getMobileSupabaseClient(), courseId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data.filter((d) => d.status !== "completed").map((d) => d.title) };
}
