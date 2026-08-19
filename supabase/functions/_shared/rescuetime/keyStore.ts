// RescueTime's credential is a bare API key, not an OAuth token pair -- no JSON envelope
// needed (contrast tokenStore.ts's WHOOP payload). Reuses the same
// store_oauth_token/get_oauth_token public wrappers (migration 0018) with
// provider='rescuetime' and no scope/expiry, since an API key doesn't expire and RescueTime
// has no scope concept to record.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function storeRescueTimeApiKey(client: SupabaseClient, userId: string, apiKey: string): Promise<void> {
  const { error } = await client.rpc("store_oauth_token", { p_user_id: userId, p_provider: "rescuetime", p_token: apiKey });
  if (error) throw new Error(`Failed to store RescueTime API key: ${error.message}`);
}

export async function getRescueTimeApiKey(client: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await client.rpc("get_oauth_token", { p_user_id: userId, p_provider: "rescuetime" });
  if (error) throw new Error(`Failed to read RescueTime API key: ${error.message}`);
  return data ?? null;
}
