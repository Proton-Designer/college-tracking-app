// A scriptable fake WhoopResourceFetcher for offline, no-key, no-cost tests. Never makes
// a network call. Keyed by "eventType:resourceId" so a test can script exactly what each
// (type, id) pair resolves to.

import type { TelemetryEventInput } from "../../core/index.ts";
import type { WhoopResourceFetcher } from "../resourceFetcher.ts";

export function createFixtureResourceFetcher(responses: Record<string, TelemetryEventInput[]>): WhoopResourceFetcher & { calls: Array<{ eventType: string; resourceId: string }> } {
  const calls: Array<{ eventType: string; resourceId: string }> = [];
  return {
    calls,
    fetchAndNormalize(_accessToken: string, eventType: string, resourceId: string): Promise<TelemetryEventInput[]> {
      calls.push({ eventType, resourceId });
      return Promise.resolve(responses[`${eventType}:${resourceId}`] ?? []);
    },
  };
}
