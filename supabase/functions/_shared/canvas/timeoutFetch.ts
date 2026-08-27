// Timeout wrapper for Canvas API calls (a P2-shaped gap, closed): canvasGetAll and
// verifyCanvasToken called `fetch` directly with no timeout and no AbortController at
// all. A single unresponsive Canvas host -- a real, common event for institutional
// systems, and the same class of problem docs/FOLLOWUPS.md P2 already fixed on the
// Supabase-REST side -- could hang for however long the platform's own defaults allow.
// canvas-sync's cron path (`canvas-sync/index.ts`) polls every connected user strictly
// serially (a `for` loop, one `await` chain per user), so one hung host doesn't just
// fail that one user -- it blocks every user later in the list for the rest of that run,
// with no signal in the result that they were skipped.
//
// packages/api already has this exact idiom (timeoutFetch.ts, from P2) but it is not
// reachable from here: Deno edge functions can't import packages/api the same
// mechanical way _shared/core mirrors packages/core (see _shared/nightly/
// domainQueries.ts's header for the established precedent -- hand-port the mechanism,
// don't try to share the module across the Deno/Node boundary). It's also scoped to
// `/rest/v1/*` URLs specifically, which a Canvas host would never match anyway. This is
// a smaller, Canvas-specific port of the same mechanism: a local `timedOut` flag set
// synchronously in the timer callback, never trusting whatever shape the underlying
// fetch's own abort rejection takes (Deno's fetch, like Node/undici and browser fetch,
// is not guaranteed to preserve a custom `AbortController.abort(reason)` value).

/**
 * 15s, not the 10s P2 picked for PostgREST: Canvas is third-party infrastructure run by
 * hundreds of different institutions on their own hardware, with real latency variance
 * timeoutFetch.ts's own reasoning (same-datacenter Supabase calls) doesn't apply to.
 * canvasGetAll's pagination loop (MAX_PAGES=10) issues one fetch per page, each with its
 * OWN timeout budget here -- a bound per request, not a bound on the whole paginated
 * poll, so a legitimately-large course's announcement/grade history isn't penalized for
 * needing a few real round trips.
 */
const CANVAS_FETCH_TIMEOUT_MS = 15_000;

export class CanvasTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Canvas did not respond within ${timeoutMs / 1000}s.`);
    this.name = "CanvasTimeoutError";
  }
}

export function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number = CANVAS_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return fetch(url, { ...init, signal: controller.signal }).catch((err) => {
    if (timedOut) throw new CanvasTimeoutError(timeoutMs);
    throw err;
  }).finally(() => clearTimeout(timer));
}
