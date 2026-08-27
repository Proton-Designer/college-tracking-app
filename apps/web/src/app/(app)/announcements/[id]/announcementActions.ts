"use server";

import { revalidatePath } from "next/cache";
import { confirmAnnouncement, type AnnouncementDiff, type ConfirmAnnouncementApplied } from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface AnnouncementDetailActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}

/**
 * The confirm gate -- the ONLY path from a staged diff to a real deliverables write.
 * The server re-validates an edited diff against the parser's own schema; it never
 * trusts an edit just because a human touched it (same grammar as syllabus confirm).
 * This action does nothing but relay to the edge function -- there is no code path
 * here, or anywhere else in this component tree, that applies a diff without this
 * explicit call.
 */
export async function confirmAnnouncementAction(input: {
  announcementId: number;
  decision: "confirmed" | "edited" | "rejected";
  editedDiff?: AnnouncementDiff;
  courseId: number;
}): Promise<AnnouncementDetailActionResult<ConfirmAnnouncementApplied>> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const result = await confirmAnnouncement(client, {
    announcementId: input.announcementId,
    decision: input.decision,
    ...(input.editedDiff != null ? { editedDiff: input.editedDiff } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/announcements");
  revalidatePath(`/courses/${input.courseId}`);
  return { ok: true, data: result.data };
}
