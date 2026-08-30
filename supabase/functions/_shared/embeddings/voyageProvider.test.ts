import { assertEquals } from "jsr:@std/assert@1";
import { createVoyageProvider } from "./voyageProvider.ts";
import { VOYAGE_DIMENSIONS, VOYAGE_MAX_BATCH } from "./types.ts";

// No VOYAGE_API_KEY exists in this environment, so `fetch` is stubbed. Every branch
// below decides whether a vector is safe to store in a vector(1024) column — which is
// exactly the set of branches that would otherwise first run in production.

function vector(fill = 0.1): number[] {
  return new Array(VOYAGE_DIMENSIONS).fill(fill);
}

function stubFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>): typeof fetch {
  return ((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init ?? {}))) as unknown as typeof fetch;
}

Deno.test("voyageProvider: sends the model, the texts, and input_type with a bearer key", async () => {
  let seenUrl = "";
  let seenAuth: string | null = null;
  let seenBody: Record<string, unknown> = {};

  const provider = createVoyageProvider(
    "vk-secret",
    stubFetch((url, init) => {
      seenUrl = url;
      seenAuth = (init.headers as Record<string, string>).Authorization ?? null;
      seenBody = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ data: [{ index: 0, embedding: vector() }], usage: { total_tokens: 7 } }), { status: 200 });
    }),
  );

  const result = await provider.embed(["hello world"], "document");

  assertEquals(seenUrl, "https://api.voyageai.com/v1/embeddings");
  assertEquals(seenAuth, "Bearer vk-secret");
  assertEquals(seenBody.model, "voyage-3.5-lite");
  assertEquals(seenBody.input, ["hello world"]);
  assertEquals(seenBody.input_type, "document");
  assertEquals(result.kind, "ok");
  if (result.kind === "ok") {
    assertEquals(result.usage.totalTokens, 7);
    // 7 tokens at $0.02/1M rounds to 0 at 6dp — the point is that it is computed, not
    // that it is nonzero.
    assertEquals(result.costUsd, 0);
  }
});

Deno.test("voyageProvider: costs are computed from real usage at the published rate", async () => {
  const provider = createVoyageProvider(
    "k",
    stubFetch(() => new Response(JSON.stringify({ data: [{ index: 0, embedding: vector() }], usage: { total_tokens: 1_000_000 } }), { status: 200 })),
  );
  const result = await provider.embed(["x"], "document");
  assertEquals(result.kind, "ok");
  if (result.kind === "ok") assertEquals(result.costUsd, 0.02);
});

Deno.test("voyageProvider: vectors are ordered by the provider's own index, never by array position", async () => {
  // A vector attached to the wrong chunk produces confident, wrong near-duplicate
  // clusters — worse than having no vector at all.
  const first = vector(0.1);
  const second = vector(0.2);
  const provider = createVoyageProvider(
    "k",
    stubFetch(() =>
      new Response(
        JSON.stringify({ data: [{ index: 1, embedding: second }, { index: 0, embedding: first }], usage: { total_tokens: 4 } }),
        { status: 200 },
      )
    ),
  );

  const result = await provider.embed(["a", "b"], "document");
  assertEquals(result.kind, "ok");
  if (result.kind === "ok") {
    assertEquals(result.vectors[0]![0], 0.1);
    assertEquals(result.vectors[1]![0], 0.2);
  }
});

Deno.test("voyageProvider: a non-2xx response is a fallback carrying the status only, not the body", async () => {
  const provider = createVoyageProvider(
    "k",
    stubFetch(() => new Response("the submitted text was: secret journal content", { status: 429 })),
  );
  const result = await provider.embed(["x"], "document");

  assertEquals(result.kind, "deterministicFallback");
  if (result.kind === "deterministicFallback") {
    assertEquals(result.reason, "provider_status_429");
    assertEquals(result.keyAbsent, false, "a 429 is retryable; an absent key is not");
    assertEquals(result.reason.includes("journal"), false, "a provider body must never reach ingest_jobs.last_error");
  }
});

Deno.test("voyageProvider: a network error returns a fallback rather than throwing into the state machine", async () => {
  const provider = createVoyageProvider("k", (() => Promise.reject(new Error("dns failure"))) as unknown as typeof fetch);
  const result = await provider.embed(["x"], "document");

  assertEquals(result.kind, "deterministicFallback");
  if (result.kind === "deterministicFallback") assertEquals(result.reason.startsWith("provider_unreachable"), true);
});

Deno.test("voyageProvider: a wrong-width vector is refused, never handed to a vector(1024) column", async () => {
  const provider = createVoyageProvider(
    "k",
    stubFetch(() => new Response(JSON.stringify({ data: [{ index: 0, embedding: [1, 2, 3] }], usage: {} }), { status: 200 })),
  );
  const result = await provider.embed(["x"], "document");

  assertEquals(result.kind, "deterministicFallback");
  if (result.kind === "deterministicFallback") assertEquals(result.reason.startsWith("provider_vector_shape_mismatch"), true);
});

Deno.test("voyageProvider: a short vector count is refused rather than silently mis-aligning chunks", async () => {
  const provider = createVoyageProvider(
    "k",
    stubFetch(() => new Response(JSON.stringify({ data: [{ index: 0, embedding: vector() }], usage: {} }), { status: 200 })),
  );
  const result = await provider.embed(["a", "b", "c"], "document");

  assertEquals(result.kind, "deterministicFallback");
  if (result.kind === "deterministicFallback") assertEquals(result.reason, "provider_returned_1_vectors_for_3_texts");
});

Deno.test("voyageProvider: a non-JSON body is a fallback, not a crash", async () => {
  const provider = createVoyageProvider("k", stubFetch(() => new Response("<html>502</html>", { status: 200 })));
  const result = await provider.embed(["x"], "document");
  assertEquals(result.kind, "deterministicFallback");
  if (result.kind === "deterministicFallback") assertEquals(result.reason, "provider_body_not_json");
});

Deno.test("voyageProvider: an oversized batch is REFUSED, not truncated", async () => {
  let called = false;
  const provider = createVoyageProvider("k", stubFetch(() => {
    called = true;
    return new Response("{}", { status: 200 });
  }));

  const result = await provider.embed(new Array(VOYAGE_MAX_BATCH + 1).fill("x"), "document");

  assertEquals(called, false);
  assertEquals(result.kind, "deterministicFallback");
  if (result.kind === "deterministicFallback") assertEquals(result.reason.startsWith("batch_too_large"), true);
});

Deno.test("voyageProvider: an empty batch never reaches the network", async () => {
  let called = false;
  const provider = createVoyageProvider("k", stubFetch(() => {
    called = true;
    return new Response("{}", { status: 200 });
  }));

  const result = await provider.embed([], "document");
  assertEquals(called, false);
  assertEquals(result.kind, "ok");
});
