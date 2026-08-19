// Real-DB proof for the full RescueTime sync chain: fetch -> normalize -> ingest ->
// rollup, using the fixture provider (no network) against the real local database.

import { createClient } from "npm:@supabase/supabase-js@2";
import { assertEquals } from "jsr:@std/assert@1";
import { createFixtureRescueTimeProvider } from "./__fixtures__/fixtureProvider.ts";
import { syncRescueTime } from "./syncHandler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function createThrowawayUser() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const email = `itest-rescuetime-sync-${Date.now()}-${Math.floor(Math.random() * 1e6)}@collegeos.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "itest-rescuetime-sync-password-1", email_confirm: true });
  if (error || !data.user) throw error ?? new Error("admin.createUser returned no user");
  return { admin, userId: data.user.id };
}

Deno.test("syncRescueTime: fetches the feed, normalizes every day, and ingests all of it into screen_daily", async () => {
  const { admin, userId } = await createThrowawayUser();
  const provider = createFixtureRescueTimeProvider([
    { date: "2026-08-19", total_hours: 6.2, all_productive_percentage: 45.5, all_distracting_percentage: 39.5 },
    { date: "2026-08-18", total_hours: 3.0, all_productive_percentage: 70, all_distracting_percentage: 10 },
  ]);

  const result = await syncRescueTime(admin, provider, userId, "fixture-api-key");
  assertEquals(result.daysFetched, 2);
  assertEquals(result.localDatesUpdated.sort(), ["2026-08-18", "2026-08-19"]);
  assertEquals(provider.callCount(), 1);

  const { data: rollups } = await admin.from("screen_daily").select("local_date").eq("user_id", userId).order("local_date");
  assertEquals(rollups!.map((r) => r.local_date), ["2026-08-18", "2026-08-19"]);
});

Deno.test("syncRescueTime: an empty feed (e.g. a brand-new account) is a clean no-op", async () => {
  const { admin, userId } = await createThrowawayUser();
  const provider = createFixtureRescueTimeProvider([]);
  const result = await syncRescueTime(admin, provider, userId, "fixture-api-key");
  assertEquals(result, { localDatesUpdated: [], daysFetched: 0 });
});
