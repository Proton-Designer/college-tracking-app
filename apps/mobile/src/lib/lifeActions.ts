import { loadLifeHub, type LifeHub } from "@collegeos/api";
import { getMobileSupabaseClient } from "./supabase/client";

/**
 * The Life hub's one read. Mirrors the direct `loadLifeHub` call apps/web's `/life` server
 * component makes; mobile routes it through here for the same reason every other screen does,
 * so a screen never touches the Supabase client itself.
 */

export type LifeHubResult = { ok: true; data: LifeHub } | { ok: false; error: string };

export async function loadLife(userId: string): Promise<LifeHubResult> {
  const client = getMobileSupabaseClient();
  const result = await loadLifeHub(client, userId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}
