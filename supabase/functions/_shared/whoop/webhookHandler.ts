// The testable orchestration behind whoop-webhook/index.ts -- resolve the account,
// refresh the token if it's expiring, fetch + normalize the referenced resource, and
// ingest it. Extracted specifically so the full chain (resolve -> refresh -> fetch ->
// normalize -> ingest -> rollup) has a real caller to test against a real database, not
// just its individual pieces in isolation -- see D20/decisions.md: a component with a
// test but no production caller is not done.
//
// Takes the OAuth provider and resource fetcher as parameters (not constructed inside)
// so webhookHandler.itest.ts can exercise the whole chain with fixtures, offline, against
// the real local DB -- the same provider/fixture split used everywhere else in L10/the
// LLM gateway.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { isTokenExpiringSoon } from "../core/index.ts";
import { ingestWhoopTelemetry } from "./ingest.ts";
import { getWhoopToken, storeWhoopToken } from "./tokenStore.ts";
import type { WhoopOAuthProvider } from "./types.ts";
import type { WhoopResourceFetcher } from "./resourceFetcher.ts";

export interface WhoopWebhookEnvelope {
  externalUserId: string;
  resourceId: string;
  eventType: string;
}

export type HandleWhoopWebhookResult =
  | { outcome: "no_matching_connection" }
  | { outcome: "no_stored_token"; userId: string }
  | { outcome: "not_ingestible_event_type"; userId: string }
  | { outcome: "deduped"; userId: string }
  | { outcome: "ingested"; userId: string; localDatesUpdated: string[] };

export async function handleWhoopWebhook(
  client: SupabaseClient,
  provider: WhoopOAuthProvider,
  resourceFetcher: WhoopResourceFetcher,
  envelope: WhoopWebhookEnvelope,
  now: string,
): Promise<HandleWhoopWebhookResult> {
  const { data: connection, error: lookupError } = await client
    .from("oauth_connections")
    .select("user_id, expires_at")
    .eq("provider", "whoop")
    .eq("external_account_id", envelope.externalUserId)
    .eq("status", "active")
    .maybeSingle();
  if (lookupError) throw new Error(`Failed to resolve WHOOP account: ${lookupError.message}`);
  if (!connection) return { outcome: "no_matching_connection" };

  const userId: string = connection.user_id;

  const token = await getWhoopToken(client, userId);
  if (!token) return { outcome: "no_stored_token", userId };

  let accessToken = token.accessToken;
  if (isTokenExpiringSoon(connection.expires_at, now)) {
    const refreshed = await provider.refreshAccessToken(token.refreshToken);
    await storeWhoopToken(client, userId, refreshed, envelope.externalUserId);
    accessToken = refreshed.accessToken;
  }

  const events = await resourceFetcher.fetchAndNormalize(accessToken, envelope.eventType, envelope.resourceId);
  if (events.length === 0) return { outcome: "not_ingestible_event_type", userId };

  const result = await ingestWhoopTelemetry(client, userId, events, envelope.resourceId);
  if (result.deduped) return { outcome: "deduped", userId };
  return { outcome: "ingested", userId, localDatesUpdated: result.localDatesUpdated };
}
