// A Canvas personal access token is a bare bearer credential, exactly rescuetime's
// shape -- no JSON envelope, no expiry (revocation is user-side in Canvas settings),
// no scope. Same store_oauth_token/get_oauth_token Vault wrappers (migration 0018),
// provider='canvas' (CHECK extended in migration 0043 -- the F3 ruling applied).

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export async function storeCanvasToken(client: SupabaseClient, userId: string, token: string): Promise<void> {
  const { error } = await client.rpc("store_oauth_token", { p_user_id: userId, p_provider: "canvas", p_token: token });
  if (error) throw new Error(`Failed to store Canvas token: ${error.message}`);
}

export async function getCanvasToken(client: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await client.rpc("get_oauth_token", { p_user_id: userId, p_provider: "canvas" });
  if (error) throw new Error(`Failed to read Canvas token: ${error.message}`);
  return data ?? null;
}
