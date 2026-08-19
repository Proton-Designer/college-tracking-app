// Real-DB proof for the full WHOOP webhook chain: resolve -> refresh-if-expiring ->
// fetch -> normalize -> ingest -> rollup. Uses the fixture OAuth provider and fixture
// resource fetcher (no network), against the real local database (real telemetry_events
// and health_daily writes) -- exactly the "does the real path work" proof D20 exists to
// force. whoop-webhook/index.ts is a thin wrapper around handleWhoopWebhook that swaps
// in the real provider/fetcher; that swap itself is not exercised here (no WHOOP
// credentials exist to hit the live API with), same boundary every other L10 integration
// draws between "the logic is proven" and "the live network call is proven."

import { createClient } from "npm:@supabase/supabase-js@2";
import { assertEquals } from "jsr:@std/assert@1";
import { createFixtureWhoopProvider } from "./__fixtures__/fixtureProvider.ts";
import { createFixtureResourceFetcher } from "./__fixtures__/fixtureResourceFetcher.ts";
import { handleWhoopWebhook } from "./webhookHandler.ts";
import { storeWhoopToken, getWhoopToken } from "./tokenStore.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const NOW = "2026-08-19T12:00:00.000Z";

async function createThrowawayUser() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const email = `itest-whoop-webhook-${Date.now()}-${Math.floor(Math.random() * 1e6)}@collegeos.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "itest-whoop-webhook-password-1", email_confirm: true });
  if (error || !data.user) throw error ?? new Error("admin.createUser returned no user");
  return { admin, userId: data.user.id };
}

function uniqueExternalUserId(): string {
  return `whoop-webhook-user-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

Deno.test("handleWhoopWebhook: full chain -- resolves the account, fetches, normalizes, ingests, and rolls up into health_daily", async () => {
  const { admin, userId } = await createThrowawayUser();
  const externalUserId = uniqueExternalUserId();
  await storeWhoopToken(admin, userId, { accessToken: "access-1", refreshToken: "refresh-1", expiresAt: "2026-08-19T14:00:00.000Z", scope: "read:workout" }, externalUserId);

  const provider = createFixtureWhoopProvider();
  const resourceFetcher = createFixtureResourceFetcher({
    "workout.updated:w1": [
      { source: "whoop", type: "workout", metric: "workout_completed", value: 1, unit: null, occurredAt: "2026-08-19T09:00:00.000Z" },
      { source: "whoop", type: "workout", metric: "strain", value: 14.5, unit: null, occurredAt: "2026-08-19T09:00:00.000Z" },
    ],
  });

  const result = await handleWhoopWebhook(admin, provider, resourceFetcher, { externalUserId, resourceId: "w1", eventType: "workout.updated" }, NOW);

  assertEquals(result, { outcome: "ingested", userId, localDatesUpdated: ["2026-08-19"] });
  assertEquals(provider.calls.refreshAccessToken, 0); // token isn't expiring yet -- no refresh call

  const { data: rollup } = await admin.from("health_daily").select("strain, workout_completed").eq("user_id", userId).eq("local_date", "2026-08-19").single();
  assertEquals(Number(rollup!.strain), 14.5);
  assertEquals(rollup!.workout_completed, true);
});

Deno.test("handleWhoopWebhook: an expiring-soon token is refreshed before the fetch, and the new token is persisted", async () => {
  const { admin, userId } = await createThrowawayUser();
  const externalUserId = uniqueExternalUserId();
  // expires_at is 2 minutes after NOW -- inside the default 5-minute refresh window.
  await storeWhoopToken(admin, userId, { accessToken: "stale-access", refreshToken: "refresh-1", expiresAt: "2026-08-19T12:02:00.000Z", scope: "read:sleep" }, externalUserId);

  const provider = createFixtureWhoopProvider({
    tokenResponse: { accessToken: "fresh-access", refreshToken: "fresh-refresh", expiresAt: "2026-08-19T15:00:00.000Z", scope: "read:sleep" },
  });
  const resourceFetcher = createFixtureResourceFetcher({
    "sleep.updated:s1": [{ source: "whoop", type: "sleep", metric: "sleep_hours", value: 7.5, unit: "hours", occurredAt: "2026-08-19T06:00:00.000Z" }],
  });

  const result = await handleWhoopWebhook(admin, provider, resourceFetcher, { externalUserId, resourceId: "s1", eventType: "sleep.updated" }, NOW);

  assertEquals(result.outcome, "ingested");
  assertEquals(provider.calls.refreshAccessToken, 1);

  const persisted = await getWhoopToken(admin, userId);
  assertEquals(persisted!.accessToken, "fresh-access"); // the refreshed token was persisted, not just used once
});

Deno.test("handleWhoopWebhook: no matching connection is acknowledged without touching any user's data", async () => {
  const { admin } = await createThrowawayUser();
  const provider = createFixtureWhoopProvider();
  const resourceFetcher = createFixtureResourceFetcher({});

  const result = await handleWhoopWebhook(admin, provider, resourceFetcher, { externalUserId: "nobody-connected-this-id", resourceId: "w1", eventType: "workout.updated" }, NOW);
  assertEquals(result, { outcome: "no_matching_connection" });
  assertEquals(resourceFetcher.calls.length, 0); // never even attempted a fetch for an unresolved account
});

Deno.test("handleWhoopWebhook: a deletion event type is acknowledged without ingesting anything", async () => {
  const { admin, userId } = await createThrowawayUser();
  const externalUserId = uniqueExternalUserId();
  await storeWhoopToken(admin, userId, { accessToken: "access-1", refreshToken: "refresh-1", expiresAt: "2026-08-19T14:00:00.000Z", scope: "read:workout" }, externalUserId);

  const provider = createFixtureWhoopProvider();
  const resourceFetcher = createFixtureResourceFetcher({}); // no entry for "workout.deleted:w1" -- resolves to []

  const result = await handleWhoopWebhook(admin, provider, resourceFetcher, { externalUserId, resourceId: "w1", eventType: "workout.deleted" }, NOW);
  assertEquals(result, { outcome: "not_ingestible_event_type", userId });
});

Deno.test("handleWhoopWebhook: a retried webhook for an already-ingested resource is deduped, not double-written", async () => {
  const { admin, userId } = await createThrowawayUser();
  const externalUserId = uniqueExternalUserId();
  await storeWhoopToken(admin, userId, { accessToken: "access-1", refreshToken: "refresh-1", expiresAt: "2026-08-19T14:00:00.000Z", scope: "read:workout" }, externalUserId);

  const provider = createFixtureWhoopProvider();
  const resourceFetcher = createFixtureResourceFetcher({
    "workout.updated:w-retry": [{ source: "whoop", type: "workout", metric: "strain", value: 10.0, unit: null, occurredAt: "2026-08-19T09:00:00.000Z" }],
  });

  const first = await handleWhoopWebhook(admin, provider, resourceFetcher, { externalUserId, resourceId: "w-retry", eventType: "workout.updated" }, NOW);
  assertEquals(first.outcome, "ingested");

  const retry = await handleWhoopWebhook(admin, provider, resourceFetcher, { externalUserId, resourceId: "w-retry", eventType: "workout.updated" }, NOW);
  assertEquals(retry, { outcome: "deduped", userId });

  const { data: rows } = await admin.from("telemetry_events").select("id").eq("user_id", userId).eq("external_id", "w-retry");
  assertEquals(rows!.length, 1); // the retry did not insert a second row
});
