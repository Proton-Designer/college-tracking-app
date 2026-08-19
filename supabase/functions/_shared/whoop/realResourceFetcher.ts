// The real WHOOP-backed WhoopResourceFetcher. Cannot be exercised against the live API in
// this environment -- no WHOOP developer credentials exist. Endpoint paths and response
// shapes are transcribed from WHOOP's publicly documented API v1 developer reference,
// RECORDED not LIVE-VERIFIED, same honesty framing as realProvider.ts and
// whoopNormalize.ts.

import { normalizeWhoopRecovery, normalizeWhoopSleep, normalizeWhoopWorkout } from "../core/index.ts";
import type { TelemetryEventInput, WhoopRecoveryPayload, WhoopSleepPayload, WhoopWorkoutPayload } from "../core/index.ts";
import type { WhoopResourceFetcher } from "./resourceFetcher.ts";

const WHOOP_API_BASE = "https://api.prod.whoop.com/developer/v1";

async function fetchJson<T>(url: string, accessToken: string): Promise<T> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`WHOOP resource fetch failed (${response.status}) for ${url}: ${body.slice(0, 500)}`);
  }
  return (await response.json()) as T;
}

/** WHOOP webhook `type` fields follow "<resource>.<action>" (e.g. "workout.updated",
 *  "workout.deleted"). Only "updated" carries a resource worth fetching -- a deletion
 *  notification has nothing left to GET, so it's acknowledged but never ingested. */
function parseEventType(eventType: string): { resource: string; action: string } | null {
  const parts = eventType.split(".");
  if (parts.length !== 2) return null;
  return { resource: parts[0], action: parts[1] };
}

export function createWhoopResourceFetcher(): WhoopResourceFetcher {
  return {
    async fetchAndNormalize(accessToken: string, eventType: string, resourceId: string): Promise<TelemetryEventInput[]> {
      const parsed = parseEventType(eventType);
      if (!parsed || parsed.action !== "updated") return [];

      switch (parsed.resource) {
        case "sleep": {
          const payload = await fetchJson<WhoopSleepPayload>(`${WHOOP_API_BASE}/activity/sleep/${resourceId}`, accessToken);
          return normalizeWhoopSleep(payload);
        }
        case "recovery": {
          const payload = await fetchJson<WhoopRecoveryPayload>(`${WHOOP_API_BASE}/cycle/${resourceId}/recovery`, accessToken);
          return normalizeWhoopRecovery(payload);
        }
        case "workout": {
          const payload = await fetchJson<WhoopWorkoutPayload>(`${WHOOP_API_BASE}/activity/workout/${resourceId}`, accessToken);
          return normalizeWhoopWorkout(payload);
        }
        default:
          return []; // an event type this integration doesn't ingest -- ack cleanly, don't fail the webhook
      }
    },
  };
}
