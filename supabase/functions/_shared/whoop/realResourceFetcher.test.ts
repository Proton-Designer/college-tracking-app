// Contract test: proves createWhoopResourceFetcher dispatches to the right WHOOP endpoint
// per event type and normalizes the response correctly. Stubs `fetch` with recorded
// response shapes -- no live WHOOP call is possible in this environment.

import { assertEquals, assertMatch, assertRejects } from "jsr:@std/assert@1";
import { createWhoopResourceFetcher } from "./realResourceFetcher.ts";

function stubFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

Deno.test("fetchAndNormalize: workout.updated fetches the workout endpoint and normalizes it", async () => {
  let capturedUrl: string | undefined;
  let capturedAuth: string | null | undefined;
  const restore = stubFetch((input, init) => {
    capturedUrl = String(input);
    capturedAuth = new Headers(init!.headers).get("authorization");
    return Promise.resolve(new Response(JSON.stringify({ id: "w1", start: "2026-08-19T08:00:00.000Z", end: "2026-08-19T09:00:00.000Z", score: { strain: 12.4 } }), { status: 200 }));
  });
  try {
    const fetcher = createWhoopResourceFetcher();
    const events = await fetcher.fetchAndNormalize("token-abc", "workout.updated", "w1");

    assertEquals(capturedUrl, "https://api.prod.whoop.com/developer/v1/activity/workout/w1");
    assertEquals(capturedAuth, "Bearer token-abc");
    assertEquals(events.some((e) => e.metric === "workout_completed"), true);
    assertEquals(events.some((e) => e.metric === "strain" && e.value === 12.4), true);
  } finally {
    restore();
  }
});

Deno.test("fetchAndNormalize: sleep.updated fetches the sleep endpoint and normalizes it", async () => {
  let capturedUrl: string | undefined;
  const restore = stubFetch((input) => {
    capturedUrl = String(input);
    return Promise.resolve(
      new Response(
        JSON.stringify({ id: "s1", start: "2026-08-18T23:00:00.000Z", end: "2026-08-19T06:00:00.000Z", score: { sleep_performance_percentage: 90, stage_summary: { total_in_bed_time_milli: 25_200_000, total_awake_time_milli: 0 } } }),
        { status: 200 },
      ),
    );
  });
  try {
    const fetcher = createWhoopResourceFetcher();
    const events = await fetcher.fetchAndNormalize("token-abc", "sleep.updated", "s1");
    assertEquals(capturedUrl, "https://api.prod.whoop.com/developer/v1/activity/sleep/s1");
    assertEquals(events.some((e) => e.metric === "sleep_hours"), true);
  } finally {
    restore();
  }
});

Deno.test("fetchAndNormalize: recovery.updated fetches the cycle recovery endpoint and normalizes it", async () => {
  let capturedUrl: string | undefined;
  const restore = stubFetch((input) => {
    capturedUrl = String(input);
    return Promise.resolve(new Response(JSON.stringify({ cycle_id: 42, created_at: "2026-08-19T07:00:00.000Z", score: { recovery_score: 71, hrv_rmssd_milli: 50, resting_heart_rate: 55 } }), { status: 200 }));
  });
  try {
    const fetcher = createWhoopResourceFetcher();
    const events = await fetcher.fetchAndNormalize("token-abc", "recovery.updated", "42");
    assertEquals(capturedUrl, "https://api.prod.whoop.com/developer/v1/cycle/42/recovery");
    assertEquals(events.some((e) => e.metric === "recovery_pct" && e.value === 71), true);
  } finally {
    restore();
  }
});

Deno.test("fetchAndNormalize: a deletion event is acknowledged with no fetch and no events, not an error", async () => {
  let fetchCalled = false;
  const restore = stubFetch(() => {
    fetchCalled = true;
    return Promise.resolve(new Response("{}", { status: 200 }));
  });
  try {
    const fetcher = createWhoopResourceFetcher();
    const events = await fetcher.fetchAndNormalize("token-abc", "workout.deleted", "w1");
    assertEquals(events, []);
    assertEquals(fetchCalled, false);
  } finally {
    restore();
  }
});

Deno.test("fetchAndNormalize: an unrecognized resource type returns no events rather than throwing", async () => {
  const fetcher = createWhoopResourceFetcher();
  const events = await fetcher.fetchAndNormalize("token-abc", "body_measurement.updated", "b1");
  assertEquals(events, []);
});

Deno.test("fetchAndNormalize: a non-2xx response throws with the status code visible", async () => {
  const restore = stubFetch(() => Promise.resolve(new Response("not found", { status: 404 })));
  try {
    const fetcher = createWhoopResourceFetcher();
    const err = await assertRejects(() => fetcher.fetchAndNormalize("token-abc", "workout.updated", "missing"));
    assertMatch((err as Error).message, /404/);
  } finally {
    restore();
  }
});
