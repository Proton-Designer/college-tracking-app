import "server-only";
import { getFocusSessionContext, type FocusSessionContext } from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export type FocusSessionLoadResult = { ok: true; data: FocusSessionContext } | { ok: false; error: string };

export async function loadFocusSession(sessionId: number): Promise<FocusSessionLoadResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const result = await getFocusSessionContext(client, user.id, sessionId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}
