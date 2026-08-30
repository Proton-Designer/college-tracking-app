import { assertEquals } from "jsr:@std/assert@1";
import { DEFAULT_ASSUMPTIONS, estimateIngestionCostUsd, estimateInvocationCount } from "./costEstimate.ts";

// Sonnet has a dated rate change (introductory pricing through 2026-08-31), so a cost
// estimate without a date is meaningless — same reason _shared/llm/costs.ts takes `now`.
const BEFORE_RATE_CHANGE = new Date("2026-08-30T00:00:00Z");
const AFTER_RATE_CHANGE = new Date("2026-09-02T00:00:00Z");

Deno.test("estimateIngestionCostUsd: a 300-page book lands inside the brief's $0.50-$1.50 target", () => {
  const before = estimateIngestionCostUsd(BEFORE_RATE_CHANGE);
  const after = estimateIngestionCostUsd(AFTER_RATE_CHANGE);

  assertEquals(before.totalUsd >= 0.5 && before.totalUsd <= 1.5, true, `intro pricing: $${before.totalUsd}`);
  assertEquals(after.totalUsd >= 0.5 && after.totalUsd <= 1.5, true, `post-2026-09-01 pricing: $${after.totalUsd}`);
  assertEquals(after.totalUsd > before.totalUsd, true, "the Sonnet rate change must actually move the number");
});

Deno.test("estimateIngestionCostUsd: extraction dominates — which is what makes triage worth paying for", () => {
  const breakdown = estimateIngestionCostUsd(AFTER_RATE_CHANGE);
  assertEquals(breakdown.extractionUsd > breakdown.triageUsd, true);
  assertEquals(breakdown.extractionUsd > breakdown.mergeUsd, true);
});

Deno.test("estimateIngestionCostUsd: a triage that filtered nothing costs materially more", () => {
  // The economic case for the cheap gate, as a number rather than an assertion.
  const filtered = estimateIngestionCostUsd(AFTER_RATE_CHANGE, { triagePassRate: 0.6 });
  const unfiltered = estimateIngestionCostUsd(AFTER_RATE_CHANGE, { triagePassRate: 1 });

  assertEquals(unfiltered.totalUsd > filtered.totalUsd * 1.4, true, `${filtered.totalUsd} -> ${unfiltered.totalUsd}`);
});

Deno.test("estimateIngestionCostUsd: embeddings are a rounding error next to the model calls", () => {
  const withKey = estimateIngestionCostUsd(AFTER_RATE_CHANGE, { embeddingsAvailable: true });
  assertEquals(withKey.embeddingsUsd < withKey.totalUsd * 0.02, true, `embeddings were $${withKey.embeddingsUsd}`);
  // Which is the honest form of D41's promise: turning the key on costs almost nothing.
  assertEquals(withKey.embeddingsUsd > 0, true);
});

Deno.test("estimateIngestionCostUsd: with no key at all, embeddings cost exactly zero", () => {
  assertEquals(estimateIngestionCostUsd(AFTER_RATE_CHANGE).embeddingsUsd, 0);
  assertEquals(DEFAULT_ASSUMPTIONS.embeddingsAvailable, false, "the default assumption is today's reality");
});

Deno.test("estimateIngestionCostUsd: cost scales with the book, not with a constant", () => {
  const short = estimateIngestionCostUsd(AFTER_RATE_CHANGE, { pageCount: 100 });
  const long = estimateIngestionCostUsd(AFTER_RATE_CHANGE, { pageCount: 600 });
  assertEquals(long.totalUsd > short.totalUsd * 3, true);
});

Deno.test("estimateInvocationCount: a 300-page book is tens of invocations, never one long one", () => {
  const invocations = estimateInvocationCount();
  assertEquals(invocations > 20, true, `${invocations} — a book really is many small invocations`);
  assertEquals(invocations < 100, true, `${invocations} — but not one per page`);
});

Deno.test("estimateIngestionCostUsd: card generation is ONE call per surviving lesson, not per card", () => {
  const breakdown = estimateIngestionCostUsd(AFTER_RATE_CHANGE);
  // 300 pages -> targetLessonCount 33. The three model-written cards come out of one call, and
  // the fourth (cloze) is deterministic and appears in this model nowhere at all, because it
  // costs nothing. That is D45's split, visible in the economics rather than only in a comment.
  assertEquals(breakdown.cardGenerationCalls, 33);
  assertEquals(breakdown.cardGenerationUsd > 0, true);
  assertEquals(breakdown.extractionUsd > breakdown.cardGenerationUsd, true, "extraction still dominates");
});

Deno.test("estimateIngestionCostUsd: card generation scales with LESSONS, not with pages", () => {
  // Every other term scales with the book's length; this one scales with its distilled output,
  // and the lesson cap is what makes a very long book stop getting more expensive to card.
  const short = estimateIngestionCostUsd(AFTER_RATE_CHANGE, { pageCount: 100 });
  const long = estimateIngestionCostUsd(AFTER_RATE_CHANGE, { pageCount: 900 });

  assertEquals(short.cardGenerationCalls, 20, "the lesson FLOOR binds on a short book");
  assertEquals(long.cardGenerationCalls, 60, "and the CAP binds on a long one");
  assertEquals(long.extractionUsd / short.extractionUsd > 5, true, "extraction grew ninefold-ish");
  assertEquals(long.cardGenerationUsd / short.cardGenerationUsd, 3, "carding grew only threefold");
});

Deno.test("estimateIngestionCostUsd: carding a 300-page book leaves little headroom under the target", () => {
  // Recorded as a number rather than left to be discovered when this assertion goes red. Adding
  // the card step moved a 300-page book from ~$1.27 to ~$1.49 at post-2026-09-01 Sonnet rates —
  // still inside the brief's $0.50–$1.50 band, but with under two cents of it left. The lever if
  // a real book confirms this is the card model: Haiku instead of Sonnet for card writing costs
  // about a third as much, and card writing from an already-distilled lesson is a far easier task
  // than extraction from raw prose. That is a decision for measured data, not for this file.
  const breakdown = estimateIngestionCostUsd(AFTER_RATE_CHANGE);
  const headroom = 1.5 - breakdown.totalUsd;
  assertEquals(headroom > 0, true, `over the target by $${-headroom}`);
  assertEquals(headroom < 0.05, true, `headroom is $${headroom} — if this ever grows, say why`);
});
