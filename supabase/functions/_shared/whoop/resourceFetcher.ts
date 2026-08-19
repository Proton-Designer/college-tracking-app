// Fetches the resource a WHOOP webhook notification refers to and normalizes it, in one
// step -- the webhook body itself is only {user_id, id, type, trace_id}: a pointer, not
// the measurement. Implemented by both the real WHOOP-backed fetcher and a fixture used
// in tests, same provider/fixture split as WhoopOAuthProvider.

import type { TelemetryEventInput } from "../core/index.ts";

export interface WhoopResourceFetcher {
  /** `eventType` is the webhook's own `type` field (e.g. "workout.updated") --
   *  dispatches to the right WHOOP endpoint and normalize function internally. Returns
   *  an empty array (not an error) for an event type this integration doesn't ingest
   *  (e.g. a deletion event), so the caller can still ack cleanly. */
  fetchAndNormalize(accessToken: string, eventType: string, resourceId: string): Promise<TelemetryEventInput[]>;
}
