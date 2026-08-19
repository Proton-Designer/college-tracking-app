// The real RescueTime-backed RescueTimeProvider. Cannot be exercised against the live API
// in this environment -- no RescueTime API key exists. Endpoint and response shape are
// transcribed from RescueTime's publicly documented Daily Summary Feed API, RECORDED not
// LIVE-VERIFIED, same honesty framing as every other L10 real provider tonight.

import type { RescueTimeDailySummaryRow } from "../core/index.ts";
import type { RescueTimeProvider } from "./types.ts";

const DAILY_SUMMARY_FEED_URL = "https://www.rescuetime.com/anapi/daily_summary_feed";

export function createRescueTimeProvider(): RescueTimeProvider {
  return {
    async fetchDailySummary(apiKey: string): Promise<RescueTimeDailySummaryRow[]> {
      const url = new URL(DAILY_SUMMARY_FEED_URL);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("format", "json");

      const response = await fetch(url);
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`RescueTime daily summary feed request failed (${response.status}): ${body.slice(0, 500)}`);
      }
      return (await response.json()) as RescueTimeDailySummaryRow[];
    },
  };
}
