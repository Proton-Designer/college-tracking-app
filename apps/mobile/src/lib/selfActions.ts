import {
  createDimension,
  getOwnProfile,
  getUserLocalToday,
  loadSelf,
  setRoute,
  type SelfView,
} from "@collegeos/api";
import { addDays, type EvidenceKind } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

export type SelfResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Matches the web page's window, so both platforms judge a standing over the same history. */
export const EVIDENCE_WINDOW_DAYS = 90;

/**
 * Desired Self's mobile paths.
 *
 * Notice what is absent, exactly as on web: nothing here sets a standing, adjusts a score, or
 * grants points. The only writable things are the dimensions and the routing map. Standing is
 * computed from the acts on every read, so there is nothing to write — the integrity constraint
 * expressed as an API surface rather than as a promise (D34).
 */
export async function loadSelfView(userId: string): Promise<SelfResult<SelfView>> {
  const client = getMobileSupabaseClient();
  const profile = await getOwnProfile(client);
  if (!profile.ok) return { ok: false, error: profile.error.message };

  const today = getUserLocalToday(profile.data.timezone, new Date());
  const result = await loadSelf(client, userId, {
    today,
    windowStart: addDays(today, -EVIDENCE_WINDOW_DAYS),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export async function addDimension(
  userId: string,
  input: { name: string; definition?: string },
): Promise<SelfResult<{ id: number }>> {
  const client = getMobileSupabaseClient();
  const result = await createDimension(client, userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: { id: result.data.id } };
}

export async function addRoute(
  userId: string,
  input: { dimensionId: number; kind: EvidenceKind; matchValue: string | null },
): Promise<SelfResult<true>> {
  const client = getMobileSupabaseClient();
  const result = await setRoute(client, userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: true };
}
