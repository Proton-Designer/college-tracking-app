import { assertEquals, assertAlmostEquals } from "jsr:@std/assert@1";
import { clusterBySimilarity, cosineSimilarity, jaccard, lexicalSimilarity, tokenize, tokenSet } from "./lexicalSimilarity.ts";
import { createDeterministicEmbeddingsProvider } from "./__fixtures__/fixtureEmbeddingsProvider.ts";

Deno.test("tokenize: drops stopwords and sub-3-character fragments", () => {
  assertEquals(tokenize("The two-minute rule is about starting, not about finishing."), [
    "two",
    "minute",
    "rule",
    "starting",
    "finishing",
  ]);
});

Deno.test("tokenize: is unicode-aware — accented prose does not collapse to nothing", () => {
  assertEquals(tokenize("Système résilient façonné"), ["système", "résilient", "façonné"]);
});

Deno.test("jaccard: two empty sets are 0, not 1 — 'we know nothing' must not read as 'identical'", () => {
  assertEquals(jaccard(new Set(), new Set()), 0);
  assertEquals(jaccard(new Set(["a"]), new Set()), 0);
});

Deno.test("jaccard: identical sets are exactly 1", () => {
  assertEquals(jaccard(tokenSet("habits compound over time"), tokenSet("habits compound over time")), 1);
});

Deno.test("lexicalSimilarity: two phrasings of one lesson score high; unrelated lessons score near zero", () => {
  const a = "Start a habit by making it two minutes long so beginning is trivially easy";
  const b = "Make the habit two minutes long, because an easy beginning is what starts it";
  const unrelated = "Compound interest rewards capital left untouched across decades of markets";

  const same = lexicalSimilarity(a, b);
  const different = lexicalSimilarity(a, unrelated);

  assertEquals(same > 0.4, true, `expected near-duplicate phrasings above 0.4, got ${same}`);
  assertEquals(different < 0.05, true, `expected unrelated lessons below 0.05, got ${different}`);
});

Deno.test("cosineSimilarity: mismatched or zero vectors return 0, never NaN", () => {
  assertEquals(cosineSimilarity([1, 2], [1, 2, 3]), 0);
  assertEquals(cosineSimilarity([0, 0], [1, 2]), 0);
  assertEquals(cosineSimilarity([], []), 0);
});

Deno.test("cosineSimilarity: a vector with itself is 1", () => {
  assertAlmostEquals(cosineSimilarity([3, 4], [3, 4]), 1, 1e-12);
});

Deno.test("clusterBySimilarity: groups transitively and leaves singletons alone", () => {
  // A~B and B~C with A~C below threshold: single-link puts all three together, which is
  // the behaviour the merge pass wants (three phrasings of one idea in one group).
  const items = ["aaa bbb ccc ddd", "ccc ddd eee fff", "eee fff ggg hhh", "totally unrelated vocabulary here"];
  const clusters = clusterBySimilarity(items, lexicalSimilarity, 0.2);

  assertEquals(clusters, [[0, 1, 2], [3]]);
});

Deno.test("clusterBySimilarity: an empty input yields no clusters", () => {
  assertEquals(clusterBySimilarity([], lexicalSimilarity, 0.5), []);
});

Deno.test("clusterBySimilarity: output ordering is deterministic — a prompt input must be reproducible", () => {
  const items = ["alpha beta gamma", "delta epsilon zeta", "alpha beta gamma delta"];
  const first = clusterBySimilarity(items, lexicalSimilarity, 0.3);
  const second = clusterBySimilarity(items, lexicalSimilarity, 0.3);

  assertEquals(first, second);
  for (const cluster of first) {
    assertEquals([...cluster].sort((a, b) => a - b), cluster, "indices within a cluster must be ascending");
  }
});

Deno.test("clusterBySimilarity: a threshold of 1 clusters only exact token-set matches", () => {
  const items = ["habits compound", "habits compound", "habits decay"];
  assertEquals(clusterBySimilarity(items, lexicalSimilarity, 1), [[0, 1], [2]]);
});

Deno.test("the embedding path clusters the same duplicates the lexical path does", async () => {
  // The D41 promise stated as a test: supplying a key changes the METRIC, not the
  // pipeline. Same items, same clustering function, same expected grouping — one run
  // over Jaccard, one over cosine against real 1024-dim vectors from the deterministic
  // fixture embedder.
  const items = [
    "Start a habit by making it two minutes long so beginning is easy",
    "Make the habit two minutes long, because an easy beginning is what starts it",
    "Compound interest rewards capital left untouched across decades",
  ];

  const lexicalClusters = clusterBySimilarity(items, lexicalSimilarity, 0.4);

  const provider = createDeterministicEmbeddingsProvider();
  const embedded = await provider.embed(items, "document");
  assertEquals(embedded.kind, "ok");
  if (embedded.kind !== "ok") return;
  const vectorClusters = clusterBySimilarity(embedded.vectors, cosineSimilarity, 0.4);

  assertEquals(lexicalClusters, [[0, 1], [2]]);
  assertEquals(vectorClusters, lexicalClusters);
});
