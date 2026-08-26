import {
  connectCanvas,
  disconnectCanvas,
  getCanvasStatus,
  listReviewableAnnouncements,
  reparseAnnouncement,
  saveCanvasCourseLinks,
  syncCanvasNow,
  type CanvasCourseLinkInput,
  type CanvasStatus,
  type CanvasSyncOutcome,
  type ConnectCanvasResult,
  type ParseAnnouncementOutcome,
  type ReviewableAnnouncement,
} from "@collegeos/api";
import { getMobileSupabaseClient } from "./supabase/client";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

export async function loadCanvasStatus(userId: string): Promise<Result<CanvasStatus>> {
  const result = await getCanvasStatus(getMobileSupabaseClient(), userId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

/** The token passes through to the edge function and into Vault; it is never persisted
 *  or logged on this side. */
export async function connectCanvasAction(baseUrl: string, token: string): Promise<Result<ConnectCanvasResult>> {
  const result = await connectCanvas(getMobileSupabaseClient(), { baseUrl, token });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export async function saveCanvasLinksAction(links: CanvasCourseLinkInput[]): Promise<Result<{ saved: number }>> {
  const result = await saveCanvasCourseLinks(getMobileSupabaseClient(), links);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export async function syncCanvasNowAction(): Promise<Result<CanvasSyncOutcome>> {
  const result = await syncCanvasNow(getMobileSupabaseClient());
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export async function disconnectCanvasAction(userId: string): Promise<Result<boolean>> {
  const result = await disconnectCanvas(getMobileSupabaseClient(), userId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export async function loadReviewableAnnouncements(userId: string): Promise<Result<ReviewableAnnouncement[]>> {
  const result = await listReviewableAnnouncements(getMobileSupabaseClient(), userId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export async function reparseAnnouncementAction(announcementId: number): Promise<Result<ParseAnnouncementOutcome>> {
  const result = await reparseAnnouncement(getMobileSupabaseClient(), announcementId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}
