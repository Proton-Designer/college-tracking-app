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
//
// `externalId` makes a webhook-triggered ingest idempotent on retry (migration 0021's
// dedup index): a webhook that doesn't get a fast-enough ack gets resent by WHOOP, and
// re-fetching + re-normalizing the same resource must not double-write telemetry_events.
// An app-level existence check handles the common case cheaply; the unique index is the
// actual atomicity guarantee for the rare concurrent-retry race, and a unique_violation
// from it is treated as "already ingested," not an error -- same
// existence-check-then-insert shape as syncBrightspaceFeed's re-sync handling.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { buildHealthDailyFromTelemetry } from "../core/index.ts";
import type { TelemetryEventInput } from "../core/index.ts";

const POSTGRES_UNIQUE_VIOLATION = "23505";

function toLocalDate(occurredAt: string): string {
  return occurredAt.slice(0, 10); // events are inserted with occurred_at; local_date is DB-trigger-derived from it
}

export async function ingestWhoopTelemetry(
  client: SupabaseClient,
  userId: string,
  events: TelemetryEventInput[],
  externalId: string | null = null,
): Promise<{ localDatesUpdated: string[]; deduped: boolean }> {
  if (events.length === 0) return { localDatesUpdated: [], deduped: false };

  if (externalId !== null) {
    const { data: existing, error: existingError } = await client
      .from("telemetry_events")
      .select("id")
      .eq("user_id", userId)
      .eq("source", "whoop")
      .eq("external_id", externalId)
      .limit(1)
      .maybeSingle();
    if (existingError) throw new Error(`Failed to check for an already-ingested WHOOP resource: ${existingError.message}`);
    if (existing) return { localDatesUpdated: [], deduped: true };
  }

  const rows = events.map((event) => ({
    user_id: userId,
    occurred_at: event.occurredAt,
    source: event.source,
    type: event.type,
    metric: event.metric,
    value: event.value,
    unit: event.unit,
    external_id: externalId,
  }));

  const { error: insertError } = await client.from("telemetry_events").insert(rows);
  if (insertError) {
    if (insertError.code === POSTGRES_UNIQUE_VIOLATION) return { localDatesUpdated: [], deduped: true };
    throw new Error(`Failed to insert WHOOP telemetry events: ${insertError.message}`);
  }

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

  return { localDatesUpdated: affectedLocalDates, deduped: false };
}
