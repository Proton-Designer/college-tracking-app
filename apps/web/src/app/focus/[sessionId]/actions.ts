"use server";

import { abandonFocusSession, completeFocusSession, type EndFocusSessionInput } from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface EndFocusResult {
  ok: boolean;
  error?: string;
}

async function requireUserId(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  return { ok: true, userId: user.id };
}

/** actual_duration_min is computed server-side from the stored actual_start -- the
 *  client never asserts a duration, it's what calibration trains on. */
export async function completeFocus(sessionId: number, input: Omit<EndFocusSessionInput, "sessionId">): Promise<EndFocusResult> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;

  const client = await getServerSupabaseClient();
  const result = await completeFocusSession(client, auth.userId, { sessionId, ...input });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** The secondary escape hatch -- leaves without going through the reflection capture.
 *  Still records real elapsed time, just excluded from calibration (day/calibration.ts). */
export async function abandonFocus(sessionId: number): Promise<EndFocusResult> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;

  const client = await getServerSupabaseClient();
  const result = await abandonFocusSession(client, auth.userId, { sessionId });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
