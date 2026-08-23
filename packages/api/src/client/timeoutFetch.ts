/**
 * P2 (docs/FOLLOWUPS.md): with PostgREST down but GoTrue/Kong still up, every REST call hung
 * until Kong's own ceiling gave up -- confirmed from Kong's live Admin API as 60s for the
 * `rest-v1` route (the `read_timeout: 150000` in kong.yml belongs to `functions-v1` only, a
 * separate route; P2's original write-up had misattributed it). Nothing in application code
 * capped how long a call could hang, so the app's own `!result.ok` error branches -- present
 * on every route, confirmed correct -- were unreachable inside human patience. A structurally
 * correct error state nobody can reach in time is not an error state.
 *
 * This wraps `fetch` with a **10 second** timeout, scoped to `/rest/v1/*` requests only.
 *
 * WHY 10s: the standard UX ceiling for "still feels like the same task" (Nielsen Norman: ~1s
 * uninterrupted flow, 10s is the limit for holding a user's attention without feedback --
 * past it the system reads as unresponsive). It's 6x margin below Kong's real 60s ceiling for
 * `rest-v1`, so this timeout fires first and the error branch it exists to reach actually
 * gets exercised -- if Kong's timeout won that race instead, the failure shape this exists to
 * fix would still be untested. Every real multi-query chain in this app (getDayView's
 * parallel batch, weekly-plan generation's sequential risk-assessment + delete + insert)
 * completes in a small number of seconds under real hosted-network latency, so 10s is
 * generous headroom, not a hair-trigger.
 *
 * WHY SCOPED TO `/rest/v1/` ONLY, not every request the client makes: supabase-js resolves
 * one `fetch` for REST, Edge Functions, auth and storage alike. `client.functions.invoke()`
 * is real, in-use, legitimately-slow-sometimes code -- `syllabus-extract` calls Anthropic and
 * can genuinely run tens of seconds on a large PDF; `account-export`, `account-delete` and
 * `brightspace-confirm` also go through this path. Kong's own `read_timeout: 150000` on
 * `functions-v1` exists deliberately for exactly this reason ("to match hosted project").
 * Wrapping those calls in a 10s abort would be a new regression on working, load-bearing
 * features, not a fix. Auth is excluded too, deliberately: P2's own failure scenario has
 * GoTrue up and validating -- timing out auth is a different, unstudied failure mode this
 * pass never characterised, so it isn't bundled in.
 */
const REST_TIMEOUT_MS = 10_000;

// @barrel-internal -- read by mapDataError (same package) to recover which kind of request
// timed out; see that file's own comment for why this is not the `error.message`-parsing it
// otherwise forbids -- this text is ours end-to-end, never text the server produced.
export const REST_TIMEOUT_SENTINEL_READ = 'COLLEGEOS_REST_TIMEOUT_READ';
// @barrel-internal -- see REST_TIMEOUT_SENTINEL_READ above.
export const REST_TIMEOUT_SENTINEL_WRITE = 'COLLEGEOS_REST_TIMEOUT_WRITE';

function isRestRequest(url: string): boolean {
  return url.includes('/rest/v1/');
}

function isMutationMethod(method: string | undefined): boolean {
  const m = (method ?? 'GET').toUpperCase();
  return m !== 'GET' && m !== 'HEAD';
}

/** `typeof fetch` allows `input` to be a `Request`, which carries its own `method` --
 *  `init.method` overrides it when both are given (the real `fetch` semantics), but a
 *  caller supplying only a `Request` (no `init`) has a real method that `init?.method`
 *  alone would silently read as `undefined` and default to GET. postgrest-js always calls
 *  with a string URL and an explicit `init.method` today, so this is latent, not live --
 *  but the wrapper is typed to accept the other form, and a future internal change to
 *  `Request`-based calls wouldn't look like a breaking change to whoever made it. */
function resolveMethod(input: RequestInfo | URL, init: RequestInit | undefined): string | undefined {
  return init?.method ?? (input instanceof Request ? input.method : undefined);
}

/**
 * `AbortError` and not some custom name: postgrest-js's own retry logic explicitly skips
 * retrying anything named `AbortError` ("never retry aborted requests"). A different name
 * would fall through into its default-retry-enabled path for idempotent methods and push the
 * real time-to-error past 10s on exactly the requests this exists to bound.
 *
 * The underlying fetch's own rejection on abort is intentionally NOT trusted or re-thrown
 * verbatim -- different runtimes (Node/undici, React Native's fetch, browser fetch) vary in
 * whether they preserve a custom `AbortController.abort(reason)` value or normalize it to a
 * generic DOMException. A local `timedOut` flag, set synchronously in the timer callback, is
 * the only signal that's reliable across all three, so the thrown error is always
 * constructed here rather than passed through.
 */
// @barrel-internal -- used only by this package's own client/*.ts constructors, never called directly by a consumer.
export function createTimeoutFetch(baseFetch: typeof fetch = fetch, timeoutMs: number = REST_TIMEOUT_MS): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (!isRestRequest(url)) return baseFetch(input, init);

    const controller = new AbortController();
    // Honest about the contract: a caller that hands us an already-aborted signal must not
    // have its request proceed just because we pass our own `controller.signal` (a fresh,
    // not-yet-aborted one) to the underlying fetch instead of theirs.
    if (init?.signal?.aborted) controller.abort();
    const forwardCallerAbort = () => controller.abort();
    init?.signal?.addEventListener('abort', forwardCallerAbort);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      return await baseFetch(input, { ...init, signal: controller.signal });
    } catch (err) {
      if (timedOut) {
        const timeoutError = new Error(isMutationMethod(resolveMethod(input, init)) ? REST_TIMEOUT_SENTINEL_WRITE : REST_TIMEOUT_SENTINEL_READ);
        timeoutError.name = 'AbortError';
        throw timeoutError;
      }
      throw err;
    } finally {
      clearTimeout(timer);
      init?.signal?.removeEventListener('abort', forwardCallerAbort);
    }
  };
}
