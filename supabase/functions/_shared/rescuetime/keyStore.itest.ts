// Real-DB proof: storeRescueTimeApiKey/getRescueTimeApiKey round-trip through the real
// store_oauth_token/get_oauth_token wrappers with provider='rescuetime' -- confirms the
// existing oauth_connections_provider_check constraint (migration 0010) already allows
// this provider, so no migration was needed to add RescueTime's credential storage.

import { createClient } from "npm:@supabase/supabase-js@2";
import { assertEquals } from "jsr:@std/assert@1";
import { getRescueTimeApiKey, storeRescueTimeApiKey } from "./keyStore.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function createThrowawayUser() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const email = `itest-rescuetime-key-${Date.now()}-${Math.floor(Math.random() * 1e6)}@collegeos.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "itest-rescuetime-key-password-1", email_confirm: true });
  if (error || !data.user) throw error ?? new Error("admin.createUser returned no user");
  return { admin, userId: data.user.id };
}

Deno.test("storeRescueTimeApiKey + getRescueTimeApiKey: round-trips a plain API key with no JSON envelope", async () => {
  const { admin, userId } = await createThrowawayUser();
  await storeRescueTimeApiKey(admin, userId, "rt-key-plain-abc123");
  const key = await getRescueTimeApiKey(admin, userId);
  assertEquals(key, "rt-key-plain-abc123");
});

Deno.test("getRescueTimeApiKey: returns null when the user has never connected RescueTime", async () => {
  const { admin, userId } = await createThrowawayUser();
  const key = await getRescueTimeApiKey(admin, userId);
  assertEquals(key, null);
});

Deno.test("storeRescueTimeApiKey: rotating the key overwrites the prior one (reuses the vault-restore fix from migration 0020)", async () => {
  const { admin, userId } = await createThrowawayUser();
  await storeRescueTimeApiKey(admin, userId, "rt-key-old");
  await storeRescueTimeApiKey(admin, userId, "rt-key-new");
  const key = await getRescueTimeApiKey(admin, userId);
  assertEquals(key, "rt-key-new");

  const { data: connections } = await admin.from("oauth_connections").select("id").eq("user_id", userId).eq("provider", "rescuetime");
  assertEquals(connections!.length, 1);
});
