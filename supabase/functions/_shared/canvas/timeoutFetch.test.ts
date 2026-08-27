import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { CanvasTimeoutError, fetchWithTimeout } from "./timeoutFetch.ts";

function stubFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

/** Mirrors a real fetch's behaviour under abort -- never preserves a custom
 *  `abort(reason)` value, always rejects with a generic AbortError once the signal
 *  fires. A passing test proves fetchWithTimeout constructs its own error rather than
 *  depending on the underlying fetch cooperating. */
function hangingFetch(): typeof fetch {
  return ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
    })) as typeof fetch;
}

Deno.test("fetchWithTimeout: a hanging request times out as CanvasTimeoutError, not the raw AbortError", async () => {
  const restore = stubFetch(hangingFetch());
  try {
    await assertRejects(() => fetchWithTimeout("https://x.instructure.com/api/v1/x", {}, 20), CanvasTimeoutError);
  } finally {
    restore();
  }
});

Deno.test("fetchWithTimeout: a request that resolves before the timeout returns normally, untouched", async () => {
  const ok = new Response(null, { status: 200 });
  const restore = stubFetch(() => Promise.resolve(ok));
  try {
    const result = await fetchWithTimeout("https://x.instructure.com/api/v1/x", {}, 1000);
    assertEquals(result, ok);
  } finally {
    restore();
  }
});

Deno.test("fetchWithTimeout: a real (non-timeout) fetch failure is never rewritten into a timeout error", async () => {
  const networkError = new TypeError("network down");
  const restore = stubFetch(() => Promise.reject(networkError));
  try {
    let caught: unknown;
    try {
      await fetchWithTimeout("https://x.instructure.com/api/v1/x", {}, 1000);
    } catch (e) {
      caught = e;
    }
    assertEquals(caught, networkError);
  } finally {
    restore();
  }
});

Deno.test("fetchWithTimeout: the timeout message names the actual bound it was given", async () => {
  const restore = stubFetch(hangingFetch());
  try {
    let caught: unknown;
    try {
      await fetchWithTimeout("https://x.instructure.com/api/v1/x", {}, 30);
    } catch (e) {
      caught = e;
    }
    assertEquals(caught instanceof CanvasTimeoutError, true);
    assertEquals((caught as Error).message, "Canvas did not respond within 0.03s.");
  } finally {
    restore();
  }
});
