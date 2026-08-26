// Offline tests for the Deepgram plumbing: submit request construction (the callback
// URL must reach Deepgram URL-encoded inside the query, or the token arm of the auth
// never comes back), and the callback parser's shapes -- ready with paragraph
// segments, words-only fallback, explicit error, and the empty-transcript-is-a-failure
// rule.

import { assertEquals } from "jsr:@std/assert@1";
import { parseDeepgramCallback, submitToDeepgram } from "./deepgram.ts";

function stubFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

Deno.test("submitToDeepgram: nova-2 + paragraphs + encoded callback, signed URL in the body, Token auth", async () => {
  let captured: { url: string; auth: string | null; body: string } | null = null;
  const restore = stubFetch(async (input, init) => {
    captured = {
      url: String(input),
      auth: new Headers(init!.headers).get("authorization"),
      body: String(init!.body),
    };
    return new Response(JSON.stringify({ request_id: "dg-123" }), { status: 200 });
  });
  try {
    const result = await submitToDeepgram(
      "dg-key",
      "https://x.supabase.co/storage/signed/abc",
      "https://x.supabase.co/functions/v1/lecture-transcript-webhook?token=t0k",
    );
    assertEquals(result, { ok: true, requestId: "dg-123", error: null });
    const url = new URL(captured!.url);
    assertEquals(url.origin + url.pathname, "https://api.deepgram.com/v1/listen");
    assertEquals(url.searchParams.get("model"), "nova-2");
    assertEquals(url.searchParams.get("paragraphs"), "true");
    assertEquals(url.searchParams.get("callback"), "https://x.supabase.co/functions/v1/lecture-transcript-webhook?token=t0k");
    assertEquals(captured!.auth, "Token dg-key");
    assertEquals(JSON.parse(captured!.body), { url: "https://x.supabase.co/storage/signed/abc" });
  } finally {
    restore();
  }
});

Deno.test("submitToDeepgram: a non-2xx comes back as ok:false with the body excerpt", async () => {
  const restore = stubFetch(() => Promise.resolve(new Response("invalid credentials", { status: 401 })));
  try {
    const result = await submitToDeepgram("bad", "https://x/audio", "https://x/cb");
    assertEquals(result.ok, false);
    assertEquals(result.error?.includes("401"), true);
  } finally {
    restore();
  }
});

Deno.test("parseDeepgramCallback: ready with paragraph segments", () => {
  const parsed = parseDeepgramCallback({
    metadata: { request_id: "dg-123" },
    results: {
      channels: [
        {
          alternatives: [
            {
              transcript: "Welcome to lecture five. Today we cover sampling bias.",
              paragraphs: {
                paragraphs: [
                  { start: 0.5, end: 4.2, sentences: [{ text: "Welcome to lecture five." }] },
                  { start: 4.4, end: 9.9, sentences: [{ text: "Today we cover sampling bias." }] },
                ],
              },
            },
          ],
        },
      ],
    },
  });
  assertEquals(parsed.kind, "ready");
  if (parsed.kind !== "ready") return;
  assertEquals(parsed.requestId, "dg-123");
  assertEquals(parsed.segments, [
    { start: 0.5, end: 4.2, text: "Welcome to lecture five." },
    { start: 4.4, end: 9.9, text: "Today we cover sampling bias." },
  ]);
});

Deno.test("parseDeepgramCallback: words-only fallback yields one whole-transcript segment", () => {
  const parsed = parseDeepgramCallback({
    results: {
      channels: [
        {
          alternatives: [
            {
              transcript: "short clip",
              words: [
                { word: "short", start: 0.1, end: 0.4 },
                { word: "clip", start: 0.5, end: 0.9 },
              ],
            },
          ],
        },
      ],
    },
  });
  assertEquals(parsed.kind, "ready");
  if (parsed.kind !== "ready") return;
  assertEquals(parsed.segments, [{ start: 0.1, end: 0.9, text: "short clip" }]);
});

Deno.test("parseDeepgramCallback: explicit error and empty transcript are both failures with reasons", () => {
  const explicit = parseDeepgramCallback({ metadata: { request_id: "r" }, error: "audio unreadable" });
  assertEquals(explicit, { kind: "failed", requestId: "r", reason: "audio unreadable" });

  const empty = parseDeepgramCallback({
    results: { channels: [{ alternatives: [{ transcript: "   " }] }] },
  });
  assertEquals(empty.kind, "failed");
  if (empty.kind === "failed") assertEquals(empty.reason.includes("empty transcript"), true);

  const malformed = parseDeepgramCallback("not an object");
  assertEquals(malformed.kind, "failed");
});
