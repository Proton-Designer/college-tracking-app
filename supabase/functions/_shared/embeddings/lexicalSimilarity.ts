// The deterministic half of D41: near-duplicate detection that works with NO embeddings
// at all.
//
// This is not a stub and not a placeholder. It is the similarity function the merge pass
// actually runs today, and it will remain the function that runs whenever a vector is
// missing (a chunk embedded before a backfill, a batch that hit a provider outage). The
// cosine path below is the same clustering algorithm over a different metric — one
// `similarity` argument apart — so supplying the key changes the metric, not the
// pipeline.
//
// Jaccard over a stopworded token set, not raw string overlap: two lessons stating the
// same idea rarely share a substring, but they do share their content words. Stopwords
// are removed because "the/and/of/that" would otherwise put every pair of English
// sentences at a floor of ~0.3 similarity and make the threshold meaningless.

/** Deliberately short and closed-class. This is not an NLP stoplist competition — it is
 *  the ~60 words that would otherwise dominate every intersection. */
const STOPWORDS = new Set([
  "a", "about", "after", "all", "also", "an", "and", "any", "are", "as", "at", "be", "because",
  "been", "before", "being", "but", "by", "can", "could", "did", "do", "does", "for", "from",
  "get", "had", "has", "have", "how", "if", "in", "into", "is", "it", "its", "just", "may",
  "more", "most", "must", "no", "not", "of", "on", "one", "only", "or", "other", "our", "out",
  "over", "should", "so", "some", "such", "than", "that", "the", "their", "them", "then",
  "there", "these", "they", "this", "those", "to", "too", "up", "use", "very", "was", "we",
  "were", "what", "when", "which", "while", "who", "why", "will", "with", "would", "you",
  "your",
]);

/** Minimum token length kept. Two-letter fragments are almost always noise or an
 *  artifact of hyphenation across a PDF line break. */
const MIN_TOKEN_LENGTH = 3;

/**
 * Lowercase, split on anything that is not a letter or digit, drop stopwords and very
 * short tokens. Unicode-aware (`\p{L}`) so accented text and non-Latin scripts tokenize
 * rather than collapsing to nothing.
 */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(token));
}

export function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text));
}

/** |A ∩ B| / |A ∪ B|. Two empty sets are 0, not 1 — "we know nothing about either" must
 *  never read as "these are identical", which would silently merge every content-free
 *  candidate into one cluster. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const token of small) {
    if (large.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Convenience over two raw strings. */
export function lexicalSimilarity(a: string, b: string): number {
  return jaccard(tokenSet(a), tokenSet(b));
}

/**
 * Cosine similarity for the embedding path. Returns 0 for a zero vector or a length
 * mismatch rather than NaN — a NaN would propagate into the clustering comparison and
 * silently make every threshold test false.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Single-link (connected-components) clustering over an arbitrary similarity function.
 *
 * Single-link, not centroid or complete-link, deliberately: the merge pass wants
 * "everything transitively about the same idea in one group so the model sees them
 * together", and a transitive chain A~B~C is exactly the case where a human would say
 * "those are three phrasings of one lesson". The cost of single-link is chaining — with
 * a low threshold everything joins one blob — which is why the caller's threshold is a
 * named constant with its own reasoning rather than a tunable.
 *
 * O(n^2) comparisons. n here is the candidate-lesson count for one book (order 100–300),
 * so ~45k similarity evaluations worst case: microseconds, and bounded by the candidate
 * cap upstream. Documented rather than optimised because the honest bound matters more
 * than the constant.
 *
 * Returns clusters of INDICES into `items`, each sorted ascending, and the clusters
 * themselves ordered by their first index — a stable, deterministic output, because this
 * feeds a prompt and a prompt that reorders between runs is not reproducible.
 */
export function clusterBySimilarity<T>(
  items: T[],
  similarity: (a: T, b: T) => number,
  threshold: number,
): number[][] {
  const n = items.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  function find(i: number): number {
    let root = i;
    while (parent[root] !== root) root = parent[root]!;
    // Path compression, so a long chain does not make later finds quadratic.
    let cursor = i;
    while (parent[cursor] !== root) {
      const next = parent[cursor]!;
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  }

  function union(a: number, b: number): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB);
  }

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (similarity(items[i]!, items[j]!) >= threshold) union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const group = groups.get(root);
    if (group) group.push(i);
    else groups.set(root, [i]);
  }

  return [...groups.values()].sort((a, b) => a[0]! - b[0]!);
}
