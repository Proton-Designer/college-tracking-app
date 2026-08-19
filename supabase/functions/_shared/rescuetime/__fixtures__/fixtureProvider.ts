// A scriptable fake RescueTimeProvider for offline, no-key, no-cost tests. Never makes a
// network call.

import type { RescueTimeDailySummaryRow } from "../../core/index.ts";
import type { RescueTimeProvider } from "../types.ts";

export function createFixtureRescueTimeProvider(rows: RescueTimeDailySummaryRow[]): RescueTimeProvider & { callCount: () => number } {
  let calls = 0;
  return {
    callCount: () => calls,
    fetchDailySummary(): Promise<RescueTimeDailySummaryRow[]> {
      calls++;
      return Promise.resolve(rows);
    },
  };
}
