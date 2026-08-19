// Real-DB proof for L10 item 3: "a new telemetry source needs no schema change." Feeds
// WHOOP-shaped payloads through the exact same normalizeWhoop* functions built for the
// real integration, ingests them through the generic telemetry_events sink (migration
// 0008, which predates WHOOP entirely), and asserts the typed health_daily rollup derives
// correctly -- proving both the ingest path and buildHealthDailyFromTelemetry's real
// (not just unit-tested) behavior against Postgres.

import { createClient } from "npm:@supabase/supabase-js@2";
import { assertEquals } from "jsr:@std/assert@1";
import { normalizeWhoopRecovery, normalizeWhoopSleep, normalizeWhoopWorkout } from "../core/index.ts";
import { ingestWhoopTelemetry } from "./ingest.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function createThrowawayUser() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const email = `itest-whoop-${Date.now()}-${Math.floor(Math.random() * 1e6)}@collegeos.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "itest-whoop-password-1", email_confirm: true });
  if (error || !data.user) throw error ?? new Error("admin.createUser returned no user");
  return { admin, userId: data.user.id };
}

Deno.test("ingestWhoopTelemetry: a full day of WHOOP payloads normalizes, ingests, and rolls up into health_daily with zero schema changes", async () => {
  const { admin, userId } = await createThrowawayUser();

  const sleepEvents = normalizeWhoopSleep({
    id: "sleep-1",
    start: "2026-08-18T23:00:00.000Z",
    end: "2026-08-19T06:30:00.000Z",
    score: { sleep_performance_percentage: 88, stage_summary: { total_in_bed_time_milli: 27_000_000, total_awake_time_milli: 1_800_000 } },
  });
  const recoveryEvents = normalizeWhoopRecovery({
    cycle_id: 42,
    created_at: "2026-08-19T07:00:00.000Z",
    score: { recovery_score: 71, hrv_rmssd_milli: 52.4, resting_heart_rate: 56 },
  });
  const workoutEvents = normalizeWhoopWorkout({
    id: "workout-1",
    start: "2026-08-19T17:00:00.000Z",
    end: "2026-08-19T18:00:00.000Z",
    score: { strain: 13.6 },
  });

  const result = await ingestWhoopTelemetry(admin, userId, [...sleepEvents, ...recoveryEvents, ...workoutEvents]);
  assertEquals(result.localDatesUpdated, ["2026-08-19"]);

  const { data: storedEvents, error: eventsError } = await admin
    .from("telemetry_events")
    .select("metric, source")
    .eq("user_id", userId);
  assertEquals(eventsError, null);
  assertEquals(storedEvents!.length, sleepEvents.length + recoveryEvents.length + workoutEvents.length);
  assertEquals(storedEvents!.every((row) => row.source === "whoop"), true);

  const { data: rollup, error: rollupError } = await admin
    .from("health_daily")
    .select("*")
    .eq("user_id", userId)
    .eq("local_date", "2026-08-19")
    .single();
  assertEquals(rollupError, null);
  assertEquals(Number(rollup!.sleep_hours), 7.0);
  assertEquals(Number(rollup!.whoop_recovery_pct), 71);
  assertEquals(Number(rollup!.hrv_ms), 52.4);
  assertEquals(Number(rollup!.resting_hr), 56);
  assertEquals(Number(rollup!.strain), 13.6);
  assertEquals(rollup!.workout_completed, true);
  assertEquals(rollup!.source, "whoop");
});

Deno.test("ingestWhoopTelemetry: re-ingesting a later reading for the same day overwrites the rollup, never appends or averages", async () => {
  const { admin, userId } = await createThrowawayUser();

  await ingestWhoopTelemetry(admin, userId, normalizeWhoopWorkout({ id: "w1", start: "2026-08-19T08:00:00.000Z", end: "2026-08-19T09:00:00.000Z", score: { strain: 6.0 } }));
  await ingestWhoopTelemetry(admin, userId, normalizeWhoopWorkout({ id: "w2", start: "2026-08-19T18:00:00.000Z", end: "2026-08-19T19:00:00.000Z", score: { strain: 15.2 } }));

  const { data: rollup } = await admin.from("health_daily").select("strain").eq("user_id", userId).eq("local_date", "2026-08-19").single();
  assertEquals(Number(rollup!.strain), 15.2); // latest workout wins, not 6.0 + 15.2 or an average

  const { data: events } = await admin.from("telemetry_events").select("id").eq("user_id", userId).eq("metric", "strain");
  assertEquals(events!.length, 2); // both raw readings are still preserved in the sink
});

Deno.test("ingestWhoopTelemetry: an empty events array is a no-op, not an error", async () => {
  const { admin, userId } = await createThrowawayUser();
  const result = await ingestWhoopTelemetry(admin, userId, []);
  assertEquals(result.localDatesUpdated, []);
  const { data: rollups } = await admin.from("health_daily").select("id").eq("user_id", userId);
  assertEquals(rollups!.length, 0);
});
