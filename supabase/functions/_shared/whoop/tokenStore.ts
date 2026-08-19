// Bridges WhoopTokenResponse (access + refresh token) onto the existing single-string
// Vault secret contract (private.store_oauth_token/get_oauth_token, migration 0010,
// reachable via the public.* wrappers from migration 0018). Rather than widen the schema
// with a second Vault-backed column for the refresh token, the pair is serialized as one
// JSON string and stored as the single secret -- the same "no schema change for a new
// shape" principle L10 item 3 is meant to demonstrate for telemetry_events applies here
// too: store_oauth_token's contract is "opaque secret string", and a JSON-encoded pair is
// still just a string to it.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { WhoopTokenResponse } from "./types.ts";

interface StoredWhoopTokenPayload {
  accessToken: string;
  refreshToken: string;
  scope: string;
}

export async function storeWhoopToken(client: SupabaseClient, userId: string, token: WhoopTokenResponse, externalAccountId: string): Promise<void> {
  const payload: StoredWhoopTokenPayload = {
    accessToken: token.accessToken,
    refreshToken: token.refreshToken,
    scope: token.scope,
  };
  const { error } = await client.rpc("store_oauth_token", {
    p_user_id: userId,
    p_provider: "whoop",
    p_token: JSON.stringify(payload),
    p_scope: token.scope,
    p_expires_at: token.expiresAt,
  });
  if (error) throw new Error(`Failed to store WHOOP token: ${error.message}`);

  // store_oauth_token's wrapper (migration 0018) upserts oauth_connections but has no
  // parameter for external_account_id -- set it with a direct, RLS-scoped update rather
  // than widening that wrapper's signature for a WHOOP-specific concern.
  const { error: updateError } = await client
    .from("oauth_connections")
    .update({ external_account_id: externalAccountId })
    .eq("user_id", userId)
    .eq("provider", "whoop");
  if (updateError) throw new Error(`Failed to record WHOOP external_account_id: ${updateError.message}`);
}

export interface StoredWhoopToken {
  accessToken: string;
  refreshToken: string;
  scope: string;
  /** Read separately from oauth_connections.expires_at by the caller -- the token
   *  payload itself doesn't carry its own expiry, that column does. */
}

export async function getWhoopToken(client: SupabaseClient, userId: string): Promise<StoredWhoopToken | null> {
  const { data, error } = await client.rpc("get_oauth_token", { p_user_id: userId, p_provider: "whoop" });
  if (error) throw new Error(`Failed to read WHOOP token: ${error.message}`);
  if (!data) return null;

  let parsed: StoredWhoopTokenPayload;
  try {
    parsed = JSON.parse(data);
  } catch {
    throw new Error("Stored WHOOP token payload is not valid JSON -- it may predate this format.");
  }
  return parsed;
}
