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
