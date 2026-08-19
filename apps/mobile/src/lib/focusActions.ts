import { abandonFocusSession, completeFocusSession, type EndFocusSessionInput } from "@collegeos/api";
import { getMobileSupabaseClient } from "./supabase/client";

export interface EndFocusResult {
  ok: boolean;
  error?: string;
}

/** actual_duration_min is computed server-side from the stored actual_start -- the
 *  client never asserts a duration, it's what calibration trains on. */
export async function completeFocus(userId: string, sessionId: number, input: Omit<EndFocusSessionInput, "sessionId">): Promise<EndFocusResult> {
  const client = getMobileSupabaseClient();
  const result = await completeFocusSession(client, userId, { sessionId, ...input });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** The secondary escape hatch -- leaves without going through the reflection capture. */
export async function abandonFocus(userId: string, sessionId: number): Promise<EndFocusResult> {
  const client = getMobileSupabaseClient();
  const result = await abandonFocusSession(client, userId, { sessionId });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
