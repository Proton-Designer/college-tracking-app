import { assertEquals } from "jsr:@std/assert@1";
import { buildClusterPlan, deterministicSelection, mergeAndRank, type MergeCandidate } from "./merge.ts";
import { targetLessonCount } from "./types.ts";
import { createFixtureProvider } from "../llm/__fixtures__/fixtureProvider.ts";
import type { GatewayDeps } from "../llm/gateway.ts";

function candidate(id: number, title: string, coreClaim: string, embedding: number[] | null = null): MergeCandidate {
  return { id, title, coreClaim, pageRef: id, embedding };
}

function gateway(toolInput: unknown, overrides: Partial<GatewayDeps> = {}): GatewayDeps {
  return {
    provider: createFixtureProvider([{ kind: "success", toolInput }]),
    getMonthlySpendUsd: () => Promise.resolve(0),
    logUsage: () => Promise.resolve(),
    now: () => new Date("2026-08-30T00:00:00Z"),
    ...overrides,
  };
}

const DUPLICATES: MergeCandidate[] = [
  // Two extractions of the SAME lesson from two chapters — the case the merge pass
  // exists for.
  candidate(1, "Start habits at two minutes", "Make the habit two minutes long so that beginning is trivially easy"),
  candidate(2, "Use the two minute rule", "Make the habit two minutes long because an easy beginning is what starts it"),
  candidate(3, "Design the environment", "Change the room around you and the room changes what you do without willpower"),
  candidate(4, "Compounding matters", "Small repeated actions compound into outcomes far larger than any single day"),
];

// ============================================================================
// Clustering — the D41 metric switch
// ============================================================================

Deno.test("buildClusterPlan: with no embeddings it clusters lexically and says so", () => {
  const plan = buildClusterPlan(DUPLICATES);

  assertEquals(plan.metric, "lexical");
  assertEquals(plan.degradedFromEmbeddings, false, "no embeddings at all is the expected D41 state, not a degradation");
  assertEquals(plan.clusters, [[1, 2], [3], [4]], "the two phrasings of the two-minute rule are one cluster");
});

Deno.test("buildClusterPlan: with every candidate embedded it clusters by cosine", () => {
  const embedded = DUPLICATES.map((c, i) => ({ ...c, embedding: i < 2 ? [1, 0.99, 0] : [0, 0, 1] }));
  const plan = buildClusterPlan(embedded);

  assertEquals(plan.metric, "cosine");
  assertEquals(plan.clusters[0], [1, 2]);
});

Deno.test("buildClusterPlan: a PARTIALLY embedded set falls back to lexical and flags the degradation", () => {
  // Mixing metrics across pairs would mean two different definitions of "duplicate"
  // inside one clustering run.
  const mixed = [{ ...DUPLICATES[0]!, embedding: [1, 0, 0] }, ...DUPLICATES.slice(1)];
  const plan = buildClusterPlan(mixed);

  assertEquals(plan.metric, "lexical");
  assertEquals(plan.degradedFromEmbeddings, true, "some-but-not-all embedded is distinguishable from no key at all");
});

Deno.test("buildClusterPlan: an empty candidate set is a valid, empty plan", () => {
  assertEquals(buildClusterPlan([]), { clusters: [], metric: "lexical", degradedFromEmbeddings: false });
});

// ============================================================================
// The deterministic count (D9: code decides how many)
// ============================================================================

Deno.test("targetLessonCount: ~1 per 9 pages, with the floor and the cap actually binding", () => {
  assertEquals(targetLessonCount(90), 20, "10 scaled would be below the floor");
  assertEquals(targetLessonCount(300), 33);
  assertEquals(targetLessonCount(900), 60, "capped");
  assertEquals(targetLessonCount(null), 20, "an unknown page count gets the floor, never a guess");
  assertEquals(targetLessonCount(0), 20);
});

// ============================================================================
// The merge call and its guards
// ============================================================================

Deno.test("mergeAndRank: keeps the model's ranking, and keeps at most ONE per duplicate cluster", async () => {
  const plan = buildClusterPlan(DUPLICATES);
  const result = await mergeAndRank(
    // The model tries to keep BOTH phrasings of the two-minute rule.
    gateway({ keep: [{ id: 2, rank: 1 }, { id: 1, rank: 2 }, { id: 3, rank: 3 }, { id: 4, rank: 4 }] }),
    { userId: "u", budgetCeilingUsd: 10, candidates: DUPLICATES, plan, pageCount: 90 },
  );

  assertEquals(result.keepIds, [2, 3, 4], "id 1 is dropped: it shares a cluster with the higher-ranked id 2");
  assertEquals(result.dropIds, [1]);
  assertEquals(result.degraded, false);
});

Deno.test("mergeAndRank: an id the model invented is discarded — it cannot add a lesson", async () => {
  // The only channel out of the merge pass is ids. This is the test that the channel is
  // actually closed.
  const plan = buildClusterPlan(DUPLICATES);
  const result = await mergeAndRank(
    gateway({ keep: [{ id: 999, rank: 1 }, { id: 3, rank: 2 }] }),
    { userId: "u", budgetCeilingUsd: 10, candidates: DUPLICATES, plan, pageCount: 90 },
  );

  assertEquals(result.keepIds.includes(999), false);
  assertEquals(result.keepIds.includes(3), true);
});

Deno.test("mergeAndRank: a repeated id counts once", async () => {
  const plan = buildClusterPlan(DUPLICATES);
  const result = await mergeAndRank(
    gateway({ keep: [{ id: 3, rank: 1 }, { id: 3, rank: 2 }, { id: 4, rank: 3 }] }),
    { userId: "u", budgetCeilingUsd: 10, candidates: DUPLICATES, plan, pageCount: 90 },
  );

  assertEquals(result.keepIds.filter((id) => id === 3).length, 1);
  assertEquals(result.keepIds.slice(0, 2), [3, 4], "the model's own order leads");
  assertEquals(new Set(result.keepIds).size, result.keepIds.length);
  // The backfill then tops up from the deterministic ordering, still one per cluster —
  // so exactly one of the {1,2} pair joins, never both.
  assertEquals(result.keepIds.includes(1) !== result.keepIds.includes(2), true);
});

Deno.test("mergeAndRank: the count is clamped to the computed target, truncating by the model's rank", async () => {
  // Deliberately disjoint vocabulary: these are 40 DIFFERENT lessons, so clustering
  // leaves 40 singletons and the count guard is what is under test, not the dedupe.
  const many = Array.from({ length: 40 }, (_, i) => candidate(i + 1, `zeta${i}`, `zeta${i} omega${i} kappa${i} sigma${i}`));
  const plan = buildClusterPlan(many);
  const result = await mergeAndRank(
    gateway({ keep: many.map((c, i) => ({ id: c.id, rank: i + 1 })) }),
    { userId: "u", budgetCeilingUsd: 10, candidates: many, plan, pageCount: 90 }, // target = floor 20
  );

  assertEquals(result.keepIds.length, 20);
  assertEquals(result.keepIds[0], 1, "the model's rank 1 survives the truncation");
  assertEquals(result.dropIds.length, 20);
});

Deno.test("mergeAndRank: a short answer is backfilled deterministically, never left below the target", async () => {
  // Deliberately disjoint vocabulary: these are 40 DIFFERENT lessons, so clustering
  // leaves 40 singletons and the count guard is what is under test, not the dedupe.
  const many = Array.from({ length: 40 }, (_, i) => candidate(i + 1, `zeta${i}`, `zeta${i} omega${i} kappa${i} sigma${i}`));
  const plan = buildClusterPlan(many);
  const result = await mergeAndRank(
    gateway({ keep: [{ id: 7, rank: 1 }] }), // a lazy answer
    { userId: "u", budgetCeilingUsd: 10, candidates: many, plan, pageCount: 90 },
  );

  assertEquals(result.keepIds.length, 20, "a lazy answer cannot shrink a book's library below its floor");
  assertEquals(result.keepIds[0], 7, "what the model did rank stays first");
});

Deno.test("mergeAndRank: with NO gateway, the deterministic selection still produces a real, deduped set", async () => {
  const plan = buildClusterPlan(DUPLICATES);
  const result = await mergeAndRank(null, {
    userId: "u",
    budgetCeilingUsd: 10,
    candidates: DUPLICATES,
    plan,
    pageCount: 27, // target = floor 20, but only 4 candidates exist
  });

  assertEquals(result.degraded, true);
  assertEquals(result.reason, "merge_model_unavailable: no Anthropic key configured");
  assertEquals(result.keepIds.length, 3, "one survivor per cluster: {1,2} collapses to one");
  assertEquals(result.keepIds.includes(1) !== result.keepIds.includes(2), true);
});

Deno.test("mergeAndRank: a model failure degrades to the deterministic set rather than losing the book", async () => {
  const plan = buildClusterPlan(DUPLICATES);
  const result = await mergeAndRank(
    gateway({ nonsense: true }), // fails Zod twice, then deterministicFallback
    { userId: "u", budgetCeilingUsd: 10, candidates: DUPLICATES, plan, pageCount: 27 },
  );

  assertEquals(result.degraded, true);
  assertEquals(result.reason?.startsWith("merge_failed"), true);
  assertEquals(result.keepIds.length, 3);
});

Deno.test("mergeAndRank: budget exhaustion degrades rather than discarding grounded lessons", async () => {
  const plan = buildClusterPlan(DUPLICATES);
  const result = await mergeAndRank(
    gateway({ keep: [] }, { getMonthlySpendUsd: () => Promise.resolve(9_999) }),
    { userId: "u", budgetCeilingUsd: 10, candidates: DUPLICATES, plan, pageCount: 27 },
  );

  assertEquals(result.reason, "merge_budget_exceeded");
  assertEquals(result.keepIds.length, 3);
});

Deno.test("mergeAndRank: the prompt carries candidate METADATA and clusters — never chunk text", async () => {
  const provider = createFixtureProvider([{ kind: "success", toolInput: { keep: [{ id: 3, rank: 1 }] } }]);
  const plan = buildClusterPlan(DUPLICATES);
  await mergeAndRank(
    { provider, getMonthlySpendUsd: () => Promise.resolve(0), logUsage: () => Promise.resolve(), now: () => new Date("2026-08-30T00:00:00Z") },
    { userId: "u", budgetCeilingUsd: 10, candidates: DUPLICATES, plan, pageCount: 90 },
  );

  const payload = JSON.parse(provider.requests()[0]!.userContent) as Record<string, unknown>;
  assertEquals(Object.keys(payload).sort(), ["candidates", "probableDuplicateGroups", "targetLessonCount"]);
  const candidates = payload.candidates as Array<Record<string, unknown>>;
  assertEquals(Object.keys(candidates[0]!).sort(), ["coreClaim", "id", "page", "title"]);
  assertEquals(payload.probableDuplicateGroups, [[1, 2]], "singletons are not worth prompt tokens");
});

Deno.test("deterministicSelection: one per cluster, biggest clusters first, longest claim as representative", () => {
  const plan = buildClusterPlan(DUPLICATES);
  const selected = deterministicSelection(DUPLICATES, plan.clusters, 10);

  assertEquals(selected.length, 3);
  // {1,2} is the only multi-member cluster, so its representative leads.
  assertEquals([1, 2].includes(selected[0]!), true);
  // The longer core claim of the pair is the representative.
  assertEquals(selected[0], 2);
});
