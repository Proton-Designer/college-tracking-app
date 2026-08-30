import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { extractLessonsFromChunk, triageChunks, type ChunkForModel } from "./lessonExtraction.ts";
import { createFixtureProvider } from "../llm/__fixtures__/fixtureProvider.ts";
import type { GatewayDeps } from "../llm/gateway.ts";

const CHUNK: ChunkForModel = {
  id: 42,
  text:
    "Habits are the compound interest of self-improvement. They seem to make little difference on any given day, and yet the impact they deliver over the months and years can be enormous.",
  pageStart: 17,
  pageEnd: 18,
};

function deps(toolInput: unknown, overrides: Partial<GatewayDeps> = {}): GatewayDeps {
  return {
    provider: createFixtureProvider([{ kind: "success", toolInput }]),
    getMonthlySpendUsd: () => Promise.resolve(0),
    logUsage: () => Promise.resolve(),
    now: () => new Date("2026-08-30T00:00:00Z"),
    ...overrides,
  };
}

function lesson(quote: string, title = "Let habits compound") {
  return {
    title,
    coreClaim: "Small repeated actions compound.",
    mechanism: null,
    claimToTask: "Pick one habit and keep it for a month.",
    evidenceStrength: "author_anecdote",
    provenanceQuote: quote,
  };
}

// ============================================================================
// The gate, at the extraction-call level
// ============================================================================

Deno.test("extractLessonsFromChunk: a grounded lesson is kept, with the CHUNK's substring as the quote", async () => {
  const result = await extractLessonsFromChunk(
    deps({ lessons: [lesson("they seem to make little difference on any given day")] }),
    { userId: "u", budgetCeilingUsd: 10, chunk: CHUNK },
  );

  assertEquals(result.kind, "ok");
  if (result.kind !== "ok") return;
  assertEquals(result.lessons.length, 1);
  assertEquals(result.lessons[0]!.provenanceQuote, "They seem to make little difference on any given day");
  assertEquals(CHUNK.text.includes(result.lessons[0]!.provenanceQuote), true);
  assertEquals(result.dropped, []);
});

Deno.test("extractLessonsFromChunk: an ungrounded lesson is DROPPED with a named reason", async () => {
  const result = await extractLessonsFromChunk(
    deps({ lessons: [lesson("The author insists that willpower is a finite and depletable resource.")] }),
    { userId: "u", budgetCeilingUsd: 10, chunk: CHUNK },
  );

  assertEquals(result.kind, "ok");
  if (result.kind !== "ok") return;
  assertEquals(result.lessons, []);
  assertEquals(result.dropped, [{ chunkId: 42, title: "Let habits compound", reason: "not_found" }]);
});

Deno.test("extractLessonsFromChunk: page_ref comes from the CHUNK, never from the model", async () => {
  // A page number the model invented is a citation pointing at the wrong place — the
  // quiet cousin of the fabricated quote.
  const result = await extractLessonsFromChunk(
    deps({ lessons: [lesson("they seem to make little difference on any given day")] }),
    { userId: "u", budgetCeilingUsd: 10, chunk: CHUNK },
  );

  assertEquals(result.kind, "ok");
  if (result.kind !== "ok") return;
  assertEquals(result.lessons[0]!.pageRef, 17);
});

Deno.test("extractLessonsFromChunk: budget exhaustion is its own outcome, not an empty success", async () => {
  const result = await extractLessonsFromChunk(
    deps({ lessons: [] }, { getMonthlySpendUsd: () => Promise.resolve(9_999) }),
    { userId: "u", budgetCeilingUsd: 10, chunk: CHUNK },
  );
  assertEquals(result.kind, "budgetExceeded");
});

Deno.test("extractLessonsFromChunk: a model failure is reported, never silently 'no lessons here'", async () => {
  const result = await extractLessonsFromChunk(deps({ garbage: true }), {
    userId: "u",
    budgetCeilingUsd: 10,
    chunk: CHUNK,
  });
  assertEquals(result.kind, "failed");
});

// ============================================================================
// Triage — and its fail-open decision
// ============================================================================

const BATCH: ChunkForModel[] = [
  { id: 1, text: "front matter and acknowledgements", pageStart: 1, pageEnd: 1 },
  { id: 2, text: "a real principle stated plainly", pageStart: 2, pageEnd: 2 },
  { id: 3, text: "a transitional paragraph", pageStart: 3, pageEnd: 3 },
];

Deno.test("triageChunks: keeps exactly what the model marks, in id order", async () => {
  const result = await triageChunks(
    deps({ chunks: [{ index: 0, hasLessons: false }, { index: 1, hasLessons: true }, { index: 2, hasLessons: false }] }),
    { userId: "u", budgetCeilingUsd: 10, chunks: BATCH },
  );

  assertEquals(result.kind, "ok");
  assertEquals(result.keepIds, [2]);
});

Deno.test("triageChunks: a chunk the model never mentions is KEPT — silence is not a 'no'", async () => {
  const result = await triageChunks(
    deps({ chunks: [{ index: 0, hasLessons: false }] }), // says nothing about 1 and 2
    { userId: "u", budgetCeilingUsd: 10, chunks: BATCH },
  );
  assertEquals(result.keepIds, [2, 3]);
});

Deno.test("triageChunks: an index that was never sent is ignored rather than guessed at", async () => {
  const result = await triageChunks(
    deps({ chunks: [{ index: 9, hasLessons: true }, { index: 0, hasLessons: true }] }),
    { userId: "u", budgetCeilingUsd: 10, chunks: BATCH },
  );
  assertEquals(result.keepIds, [1, 2, 3]);
});

Deno.test("triageChunks: a model FAILURE fails OPEN — every chunk passes, and it is recorded as degraded", async () => {
  // The decision this test exists to lock in: an outage must never be
  // indistinguishable from a boring book. Failing closed would silently delete a
  // chapter's worth of lessons and nobody would ever know which happened.
  const result = await triageChunks(deps({ nonsense: true }), {
    userId: "u",
    budgetCeilingUsd: 10,
    chunks: BATCH,
  });

  assertEquals(result.kind, "degraded");
  assertEquals(result.keepIds, [1, 2, 3]);
  if (result.kind === "degraded") assertStringIncludes(result.reason, "triage_failed");
});

Deno.test("triageChunks: budget exhaustion also fails open, leaving the refusal to the extraction call", async () => {
  const result = await triageChunks(deps({ chunks: [] }, { getMonthlySpendUsd: () => Promise.resolve(9_999) }), {
    userId: "u",
    budgetCeilingUsd: 10,
    chunks: BATCH,
  });

  assertEquals(result.kind, "degraded");
  assertEquals(result.keepIds, [1, 2, 3]);
  if (result.kind === "degraded") assertEquals(result.reason, "triage_budget_exceeded");
});

Deno.test("triageChunks: an empty batch makes no call at all", async () => {
  const provider = createFixtureProvider([{ kind: "success", toolInput: { chunks: [] } }]);
  const result = await triageChunks(
    { provider, getMonthlySpendUsd: () => Promise.resolve(0), logUsage: () => Promise.resolve(), now: () => new Date() },
    { userId: "u", budgetCeilingUsd: 10, chunks: [] },
  );

  assertEquals(result.keepIds, []);
  assertEquals(provider.callCount(), 0);
});

Deno.test("triageChunks: passages reach the prompt numbered, so an index answer is unambiguous", async () => {
  const provider = createFixtureProvider([{ kind: "success", toolInput: { chunks: [] } }]);
  await triageChunks(
    { provider, getMonthlySpendUsd: () => Promise.resolve(0), logUsage: () => Promise.resolve(), now: () => new Date() },
    { userId: "u", budgetCeilingUsd: 10, chunks: BATCH },
  );

  const sent = provider.requests()[0]!.userContent;
  assertStringIncludes(sent, "<<PASSAGE 0>>");
  assertStringIncludes(sent, "<<PASSAGE 2>>");
});
