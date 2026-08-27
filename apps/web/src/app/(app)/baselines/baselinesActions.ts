"use server";

import { updateOwnProfile } from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface SetBaselineResult {
  ok: boolean;
  error?: string;
}

/**
 * Persists the FULL weekday-baseline map (not a single-key patch) -- `weekday_baselines`
 * is one jsonb column, so a partial write would silently drop every other weekday's
 * value. The caller sends the map it wants stored, already merged.
 */
export async function setBaselinesAction(nextMap: Record<string, number>): Promise<SetBaselineResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const result = await updateOwnProfile(client, user.id, { weekday_baselines: nextMap });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
