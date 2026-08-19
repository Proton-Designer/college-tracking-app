// Contract test: proves createRescueTimeProvider parses RescueTime's publicly documented
// Daily Summary Feed response shape and sends the API key correctly. Cannot call the live
// API in this environment (no RescueTime key exists) -- stubs `fetch` with a recorded
// response shape, same approach as every other realProvider.test.ts tonight.

import { assertEquals, assertMatch, assertRejects } from "jsr:@std/assert@1";
import { createRescueTimeProvider } from "./realProvider.ts";

const GOLDEN_FEED_RESPONSE = [
  { date: "2026-08-19", total_hours: 6.2, all_productive_percentage: 45.5, all_distracting_percentage: 39.5 },
  { date: "2026-08-18", total_hours: 4.1, all_productive_percentage: 60.0, all_distracting_percentage: 20.0 },
];

function stubFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

Deno.test("realProvider: fetchDailySummary sends the API key as a query param and parses the golden response", async () => {
  let capturedUrl: URL | undefined;
  const restore = stubFetch((input) => {
    capturedUrl = new URL(String(input));
    return Promise.resolve(new Response(JSON.stringify(GOLDEN_FEED_RESPONSE), { status: 200 }));
  });
  try {
    const provider = createRescueTimeProvider();
    const rows = await provider.fetchDailySummary("rt-key-abc123");

    assertEquals(capturedUrl!.origin + capturedUrl!.pathname, "https://www.rescuetime.com/anapi/daily_summary_feed");
    assertEquals(capturedUrl!.searchParams.get("key"), "rt-key-abc123");
    assertEquals(rows, GOLDEN_FEED_RESPONSE);
  } finally {
    restore();
  }
});

Deno.test("realProvider: a non-2xx response throws with the status code visible, not a silent empty array", async () => {
  const restore = stubFetch(() => Promise.resolve(new Response("invalid key", { status: 401 })));
  try {
    const provider = createRescueTimeProvider();
    const err = await assertRejects(() => provider.fetchDailySummary("bad-key"));
    assertMatch((err as Error).message, /401/);
  } finally {
    restore();
  }
});
