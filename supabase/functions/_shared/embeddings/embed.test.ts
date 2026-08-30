import { assertEquals } from "jsr:@std/assert@1";
import { EMBEDDINGS_KEY_ABSENT_REASON, embedTexts, embeddingsKeyAbsent, resolveEmbeddingsProvider } from "./embed.ts";
import { createFixtureEmbeddingsProvider } from "./__fixtures__/fixtureEmbeddingsProvider.ts";
import { VOYAGE_DIMENSIONS } from "./types.ts";

// D41's whole claim is that the no-key path is a first-class, tested state. These are
// the tests that make that claim true rather than aspirational.

Deno.test("resolveEmbeddingsProvider: no VOYAGE_API_KEY returns null — an ordinary value, not a throw", () => {
  const provider = resolveEmbeddingsProvider(() => undefined);
  assertEquals(provider, null);
});

Deno.test("resolveEmbeddingsProvider: a whitespace-only key is treated as absent, not as a key", () => {
  // A half-configured secret (someone pasted a newline) must degrade the same way an
  // unset one does, rather than producing 401s on every batch forever.
  assertEquals(resolveEmbeddingsProvider(() => "   "), null);
  assertEquals(resolveEmbeddingsProvider(() => ""), null);
});

Deno.test("resolveEmbeddingsProvider: a real key produces a provider at the schema's dimensions", () => {
  const provider = resolveEmbeddingsProvider(() => "voyage-key-xyz");
  assertEquals(provider?.model, "voyage-3.5-lite");
  assertEquals(provider?.dimensions, VOYAGE_DIMENSIONS, "must match source_chunks.embedding vector(1024)");
});

Deno.test("embedTexts: with no provider, returns a NAMED absence — never throws, never silently returns []", async () => {
  const result = await embedTexts(null, ["some chunk text", "another chunk"]);

  assertEquals(result.kind, "deterministicFallback");
  if (result.kind === "deterministicFallback") {
    assertEquals(result.keyAbsent, true, "keyAbsent distinguishes 'never configured' from 'failed this time'");
    assertEquals(result.reason, EMBEDDINGS_KEY_ABSENT_REASON);
  }
});

Deno.test("embedTexts: an empty batch is a trivial success, not an absence — no call, no cost", async () => {
  const provider = createFixtureEmbeddingsProvider([{ kind: "ok", vectors: [] }]);
  const result = await embedTexts(provider, []);

  assertEquals(result.kind, "ok");
  if (result.kind === "ok") {
    assertEquals(result.vectors, []);
    assertEquals(result.costUsd, 0);
  }
  assertEquals(provider.calls().length, 0, "an empty tail batch must not reach the provider");
});

Deno.test("embedTexts: with no provider AND an empty batch, the empty-batch success wins", async () => {
  // Ordering matters: reporting keyAbsent for zero texts would make the job record an
  // absence it never actually needed the key for.
  const result = await embedTexts(null, []);
  assertEquals(result.kind, "ok");
});

Deno.test("embedTexts: a provider failure is a fallback with keyAbsent false — retryable, unlike an absent key", async () => {
  const provider = createFixtureEmbeddingsProvider([{ kind: "fallback", reason: "provider_status_503" }]);
  const result = await embedTexts(provider, ["text"]);

  assertEquals(result.kind, "deterministicFallback");
  if (result.kind === "deterministicFallback") {
    assertEquals(result.keyAbsent, false);
    assertEquals(result.reason, "provider_status_503");
  }
});

Deno.test("embedTexts: documents are embedded as documents, not as queries", async () => {
  const provider = createFixtureEmbeddingsProvider([{ kind: "ok", vectors: [[1]] }]);
  await embedTexts(provider, ["chunk"]);
  assertEquals(provider.calls()[0]!.inputType, "document");

  await embedTexts(provider, ["a question"], "query");
  assertEquals(provider.calls()[1]!.inputType, "query");
});

Deno.test("embeddingsKeyAbsent: the named absence value is stable across call sites", () => {
  assertEquals(embeddingsKeyAbsent(), {
    kind: "deterministicFallback",
    reason: EMBEDDINGS_KEY_ABSENT_REASON,
    keyAbsent: true,
  });
});
