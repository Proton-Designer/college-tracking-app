// RescueTime provider contract. Simpler than WHOOP's: RescueTime is API-key auth (no
// OAuth2 flow, no refresh, no expiry) and pull-only (no webhooks) -- the Daily Summary
// Feed endpoint just returns the last ~2 weeks of daily rollups on every call.

import type { RescueTimeDailySummaryRow } from "../core/index.ts";

export interface RescueTimeProvider {
  fetchDailySummary(apiKey: string): Promise<RescueTimeDailySummaryRow[]>;
}
