// Ties rescuetimeNormalize + screenDailyRollup (packages/core, mirrored) to the real
// database -- the RescueTime analogue of whoop/ingest.ts. Insert into the generic
// telemetry_events sink, then derive and upsert screen_daily for the affected date(s).
//
// Deliberately does NOT use telemetry_events.external_id/dedup here (contrast WHOOP's
// ingest, which does): a WHOOP webhook resource is immutable once created, so a retry
// re-fetching the identical resource must be a no-op. RescueTime's daily summary for a
// recent day is a LIVE, still-changing rollup -- a re-sync of today legitimately has a
// bigger total_screen_min than the sync an hour ago, and must UPDATE the picture, not
// skip as a duplicate. The "latest wins" read-back ordering (occurred_at, then id as a
// tiebreak for same-instant rows -- see whoop/ingest.ts's fix) is what makes repeated
// same-day syncs correct without needing resource-level idempotency at all.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { buildScreenDailyFromTelemetry } from "../core/index.ts";
import type { TelemetryEventInput } from "../core/index.ts";

function toLocalDate(occurredAt: string): string {
  return occurredAt.slice(0, 10);
}

export async function ingestRescueTimeTelemetry(client: SupabaseClient, userId: string, events: TelemetryEventInput[]): Promise<{ localDatesUpdated: string[] }> {
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
  if (insertError) throw new Error(`Failed to insert RescueTime telemetry events: ${insertError.message}`);

  const affectedLocalDates = Array.from(new Set(events.map((event) => toLocalDate(event.occurredAt))));

  for (const localDate of affectedLocalDates) {
    const { data: dayEvents, error: readError } = await client
      .from("telemetry_events")
      .select("metric, value")
      .eq("user_id", userId)
      .eq("source", "rescuetime")
      .eq("local_date", localDate)
      .order("occurred_at", { ascending: true })
      .order("id", { ascending: true });
    if (readError) throw new Error(`Failed to read back RescueTime telemetry for rollup: ${readError.message}`);

    const patch = buildScreenDailyFromTelemetry(dayEvents ?? []);

    const { error: upsertError } = await client.from("screen_daily").upsert(
      {
        user_id: userId,
        local_date: localDate,
        total_screen_min: patch.totalScreenMin,
        distracting_min: patch.distractingMin,
        productive_min: patch.productiveMin,
        source: "rescuetime",
      },
      { onConflict: "user_id,local_date" },
    );
    if (upsertError) throw new Error(`Failed to upsert screen_daily rollup: ${upsertError.message}`);
  }

  return { localDatesUpdated: affectedLocalDates };
}
