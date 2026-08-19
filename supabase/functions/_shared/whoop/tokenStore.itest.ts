// Real-DB proof for the JSON-blob-in-a-single-Vault-secret bridge (see tokenStore.ts's
// header comment): storeWhoopToken/getWhoopToken must round-trip through the real
// store_oauth_token/get_oauth_token wrappers (migration 0018) and correctly record
// external_account_id (migration 0019) for webhook resolution.

import { createClient } from "npm:@supabase/supabase-js@2";
import { assertEquals } from "jsr:@std/assert@1";
import { getWhoopToken, storeWhoopToken } from "./tokenStore.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function createThrowawayUser() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const email = `itest-whoop-token-${Date.now()}-${Math.floor(Math.random() * 1e6)}@collegeos.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "itest-whoop-token-password-1", email_confirm: true });
  if (error || !data.user) throw error ?? new Error("admin.createUser returned no user");
  return { admin, userId: data.user.id };
}

// oauth_connections has a unique index on (provider, external_account_id) -- a literal
// like "whoop-external-42" would collide with a PRIOR test run's row that's still in the
// database (deno test doesn't reset state between separate invocations, unlike db:reset).
// Same reasoning as createThrowawayUser's own email suffix.
function uniqueExternalId(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

Deno.test("storeWhoopToken + getWhoopToken: round-trips the access/refresh pair and records external_account_id", async () => {
  const { admin, userId } = await createThrowawayUser();
  const externalId = uniqueExternalId("whoop-external-round-trip");

  await storeWhoopToken(
    admin,
    userId,
    { accessToken: "access-abc", refreshToken: "refresh-xyz", expiresAt: "2026-08-19T14:00:00.000Z", scope: "read:sleep read:recovery" },
    externalId,
  );

  const token = await getWhoopToken(admin, userId);
  assertEquals(token, { accessToken: "access-abc", refreshToken: "refresh-xyz", scope: "read:sleep read:recovery" });

  const { data: connection, error } = await admin
    .from("oauth_connections")
    .select("external_account_id, expires_at, provider")
    .eq("user_id", userId)
    .eq("provider", "whoop")
    .single();
  assertEquals(error, null);
  assertEquals(connection!.external_account_id, externalId);
  assertEquals(connection!.expires_at, "2026-08-19T14:00:00+00:00");
});

Deno.test("getWhoopToken: returns null when the user has never connected WHOOP, not a thrown error", async () => {
  const { admin, userId } = await createThrowawayUser();
  const token = await getWhoopToken(admin, userId);
  assertEquals(token, null);
});

Deno.test("storeWhoopToken: re-storing (e.g. a token refresh) overwrites the prior token for the same user+provider", async () => {
  const { admin, userId } = await createThrowawayUser();
  const externalId = uniqueExternalId("whoop-external-restore");

  await storeWhoopToken(admin, userId, { accessToken: "old-access", refreshToken: "old-refresh", expiresAt: "2026-08-19T14:00:00.000Z", scope: "read:sleep" }, externalId);
  await storeWhoopToken(admin, userId, { accessToken: "new-access", refreshToken: "new-refresh", expiresAt: "2026-08-19T15:00:00.000Z", scope: "read:sleep" }, externalId);

  const token = await getWhoopToken(admin, userId);
  assertEquals(token!.accessToken, "new-access");

  const { data: connections } = await admin.from("oauth_connections").select("id").eq("user_id", userId).eq("provider", "whoop");
  assertEquals(connections!.length, 1); // upsert, not a second row
});

Deno.test("cross-user isolation: one user's WHOOP token is never returned for another user's id", async () => {
  const { admin, userId } = await createThrowawayUser();
  const { userId: otherUserId } = await createThrowawayUser();

  await storeWhoopToken(admin, userId, { accessToken: "mine", refreshToken: "mine-refresh", expiresAt: "2026-08-19T14:00:00.000Z", scope: "read:sleep" }, uniqueExternalId("whoop-external-isolation"));

  const otherToken = await getWhoopToken(admin, otherUserId);
  assertEquals(otherToken, null);
});
