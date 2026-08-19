// Ties whoopNormalize + healthDailyRollup (packages/core, mirrored) to the real database:
// insert the normalized events into the generic telemetry_events sink, then derive and
// upsert the typed health_daily rollup for the affected local_date(s). This function IS
// the L10 item 3 proof that a new telemetry source needs zero schema change -- it writes
// to tables that existed before WHOOP was ever built (migration 0008).
//
// Deliberately re-derives the rollup from ALL of that day's stored events (not just the
// ones just inserted) rather than merging the new events into whatever health_daily
// already holds -- "rebuildable from telemetry_events" (0008's own table comment) means
// the rollup must be reproducible from the raw table, not an accumulator with drift risk.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { buildHealthDailyFromTelemetry } from "../core/index.ts";
import type { TelemetryEventInput } from "../core/index.ts";

function toLocalDate(occurredAt: string): string {
  return occurredAt.slice(0, 10); // events are inserted with occurred_at; local_date is DB-trigger-derived from it
}

export async function ingestWhoopTelemetry(client: SupabaseClient, userId: string, events: TelemetryEventInput[]): Promise<{ localDatesUpdated: string[] }> {
  if (events.length === 0) return { localDatesUpdated: [] };

  const rows = events.map((event) => ({
    user_id: userId,
    occurred_at: event.occurredAt,
    source: event.source,
    type: event.type,
    metric: event.metric,
    value: event.value,
    unit: event.unit,
  }));

  const { error: insertError } = await client.from("telemetry_events").insert(rows);
  if (insertError) throw new Error(`Failed to insert WHOOP telemetry events: ${insertError.message}`);

  const affectedLocalDates = Array.from(new Set(events.map((event) => toLocalDate(event.occurredAt))));

  for (const localDate of affectedLocalDates) {
    const { data: dayEvents, error: readError } = await client
      .from("telemetry_events")
      .select("metric, value")
      .eq("user_id", userId)
      .eq("source", "whoop")
      .eq("local_date", localDate)
      .order("occurred_at", { ascending: true });
    if (readError) throw new Error(`Failed to read back WHOOP telemetry for rollup: ${readError.message}`);

    const patch = buildHealthDailyFromTelemetry(dayEvents ?? []);

    const { error: upsertError } = await client.from("health_daily").upsert(
      {
        user_id: userId,
        local_date: localDate,
        sleep_hours: patch.sleepHours,
        whoop_recovery_pct: patch.whoopRecoveryPct,
        hrv_ms: patch.hrvMs,
        resting_hr: patch.restingHr,
        strain: patch.strain,
        workout_completed: patch.workoutCompleted,
        source: "whoop",
      },
      { onConflict: "user_id,local_date" },
    );
    if (upsertError) throw new Error(`Failed to upsert health_daily rollup: ${upsertError.message}`);
  }

  return { localDatesUpdated: affectedLocalDates };
}
