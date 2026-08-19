// Real-DB proof, RescueTime analogue of whoop/ingest.itest.ts: normalized RescueTime
// payloads ingest through the generic telemetry_events sink and roll up into screen_daily
// using only tables that predate RescueTime entirely (migration 0008) -- L10 item 3's
// proof, now demonstrated for a SECOND independent source.

import { createClient } from "npm:@supabase/supabase-js@2";
import { assertEquals } from "jsr:@std/assert@1";
import { normalizeRescueTimeDailySummary } from "../core/index.ts";
import { ingestRescueTimeTelemetry } from "./ingest.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function createThrowawayUser() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const email = `itest-rescuetime-${Date.now()}-${Math.floor(Math.random() * 1e6)}@collegeos.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "itest-rescuetime-password-1", email_confirm: true });
  if (error || !data.user) throw error ?? new Error("admin.createUser returned no user");
  return { admin, userId: data.user.id };
}

Deno.test("ingestRescueTimeTelemetry: a daily summary normalizes, ingests, and rolls up into screen_daily with zero schema changes", async () => {
  const { admin, userId } = await createThrowawayUser();

  const events = normalizeRescueTimeDailySummary({ date: "2026-08-19", total_hours: 6.2, all_productive_percentage: 45.5, all_distracting_percentage: 39.5 });
  const result = await ingestRescueTimeTelemetry(admin, userId, events);
  assertEquals(result.localDatesUpdated, ["2026-08-19"]);

  const { data: storedEvents } = await admin.from("telemetry_events").select("metric, source").eq("user_id", userId);
  assertEquals(storedEvents!.length, 3);
  assertEquals(storedEvents!.every((row) => row.source === "rescuetime"), true);

  const { data: rollup } = await admin.from("screen_daily").select("*").eq("user_id", userId).eq("local_date", "2026-08-19").single();
  assertEquals(Number(rollup!.total_screen_min), 372);
  assertEquals(Number(rollup!.productive_min), 169);
  assertEquals(Number(rollup!.distracting_min), 147);
  assertEquals(rollup!.source, "rescuetime");
});

Deno.test("ingestRescueTimeTelemetry: re-syncing the same day UPDATES the rollup with the newer total, unlike WHOOP's immutable-resource dedup", async () => {
  const { admin, userId } = await createThrowawayUser();

  await ingestRescueTimeTelemetry(admin, userId, normalizeRescueTimeDailySummary({ date: "2026-08-19", total_hours: 2.0, all_productive_percentage: 50, all_distracting_percentage: 10 }));
  await ingestRescueTimeTelemetry(admin, userId, normalizeRescueTimeDailySummary({ date: "2026-08-19", total_hours: 6.0, all_productive_percentage: 40, all_distracting_percentage: 30 }));

  const { data: rollup } = await admin.from("screen_daily").select("total_screen_min").eq("user_id", userId).eq("local_date", "2026-08-19").single();
  assertEquals(Number(rollup!.total_screen_min), 360); // the later, larger sync wins -- a live rollup, not a frozen one

  const { data: rawEvents } = await admin.from("telemetry_events").select("id").eq("user_id", userId).eq("metric", "total_screen_min");
  assertEquals(rawEvents!.length, 2); // both raw readings preserved in the sink
});

Deno.test("ingestRescueTimeTelemetry: an empty events array is a no-op, not an error", async () => {
  const { admin, userId } = await createThrowawayUser();
  const result = await ingestRescueTimeTelemetry(admin, userId, []);
  assertEquals(result.localDatesUpdated, []);
  const { data: rollups } = await admin.from("screen_daily").select("id").eq("user_id", userId);
  assertEquals(rollups!.length, 0);
});

Deno.test("ingestRescueTimeTelemetry: multiple days in one feed response all ingest and roll up independently", async () => {
  const { admin, userId } = await createThrowawayUser();

  const day1 = normalizeRescueTimeDailySummary({ date: "2026-08-18", total_hours: 4.0, all_productive_percentage: 60, all_distracting_percentage: 15 });
  const day2 = normalizeRescueTimeDailySummary({ date: "2026-08-19", total_hours: 5.0, all_productive_percentage: 30, all_distracting_percentage: 40 });
  const result = await ingestRescueTimeTelemetry(admin, userId, [...day1, ...day2]);
  assertEquals(result.localDatesUpdated.sort(), ["2026-08-18", "2026-08-19"]);

  const { data: rollups } = await admin.from("screen_daily").select("local_date, total_screen_min").eq("user_id", userId).order("local_date");
  assertEquals(rollups!.length, 2);
  assertEquals(Number(rollups![0].total_screen_min), 240);
  assertEquals(Number(rollups![1].total_screen_min), 300);
});
