"use server";

import { reparseAnnouncement, type ParseAnnouncementOutcome } from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface AnnouncementsActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

/** Re-parses an existing pending/failed row -- the {announcementId} arm of
 *  parse-announcement, which refuses an already-applied row server-side. A
 *  'noSchedulableContent' outcome is a real success (filed to the course, nothing to
 *  confirm), not an error -- the caller drops the row from its worklist rather than
 *  navigating anywhere. */
export async function reparseAnnouncementAction(announcementId: number): Promise<AnnouncementsActionResult<ParseAnnouncementOutcome>> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const result = await reparseAnnouncement(client, announcementId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}
