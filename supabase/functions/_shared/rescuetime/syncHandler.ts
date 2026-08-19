// The testable orchestration behind rescuetime-sync/index.ts -- fetch the daily summary
// feed, normalize every returned day, and ingest all of it in one pass. Extracted for the
// same D20 reason as WHOOP's webhookHandler.ts: a component isn't done until something in
// the real request path calls it, and this is the thing that gets fixture-tested against
// the real local DB to prove the ingest logic actually has a real caller.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { normalizeRescueTimeDailySummary } from "../core/index.ts";
import { ingestRescueTimeTelemetry } from "./ingest.ts";
import type { RescueTimeProvider } from "./types.ts";

export async function syncRescueTime(client: SupabaseClient, provider: RescueTimeProvider, userId: string, apiKey: string): Promise<{ localDatesUpdated: string[]; daysFetched: number }> {
  const rows = await provider.fetchDailySummary(apiKey);
  const events = rows.flatMap((row) => normalizeRescueTimeDailySummary(row));
  const result = await ingestRescueTimeTelemetry(client, userId, events);
  return { localDatesUpdated: result.localDatesUpdated, daysFetched: rows.length };
}
