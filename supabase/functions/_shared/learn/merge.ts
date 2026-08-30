// The whole-book merge/dedupe/rank pass.
//
// What the model sees: the candidate LIST (id, title, claim, page) plus the similarity
// clusters computed here. NOT the book, and not the chunk text — one prompt containing a
// 300-page book is the thing the state machine exists to make impossible, and the model
// does not need it: every candidate has already been extracted and grounded, so the only
// remaining questions are "which of these are the same lesson" and "which matter most".
//
// What the model may return: ids and an order. Nothing else. That is why this step cannot
// smuggle a lesson past the provenance gate — there is no text channel through which one
// could arrive.
//
// What deterministic code decides (D9): the clusters, the count (~1 per 8–10 pages, floor
// 20, cap 60), the one-survivor-per-cluster rule, and the backfill when the model returns
// too few. The model orders; code decides how many and enforces the dedupe.

import { clusterBySimilarity, cosineSimilarity, lexicalSimilarity } from "../embeddings/lexicalSimilarity.ts";
import type { GatewayDeps } from "../llm/gateway.ts";
import { callLlm } from "../llm/gateway.ts";
import {
  COSINE_DUPLICATE_THRESHOLD,
  LEXICAL_DUPLICATE_THRESHOLD,
  MERGE_TOOL_SCHEMA,
  MergeResultSchema,
  targetLessonCount,
} from "./types.ts";

const MERGE_MODEL = "claude-sonnet-5" as const;
/** 60 ids and ranks is a small object; the ceiling is generous for a large candidate
 *  set, not for prose the model is not asked to write. */
const MERGE_MAX_TOKENS = 4_096;

export interface MergeCandidate {
  id: number;
  title: string;
  coreClaim: string;
  pageRef: number | null;
  /** Present only where a vector was actually stored. Under the D41 no-key path this is
   *  null for every candidate, and clustering runs on lexical similarity instead. */
  embedding: number[] | null;
}

export interface ClusterPlan {
  /** Clusters of candidate IDS (not indices) — stable and ascending. */
  clusters: number[][];
  /** Which similarity actually ran. Recorded so a source ingested before the key existed
   *  is distinguishable from one ingested after. */
  metric: "cosine" | "lexical";
  /** True when embeddings were expected but at least one was missing, so lexical ran
   *  even though a provider exists. */
  degradedFromEmbeddings: boolean;
}

/**
 * Cluster candidates by near-duplicate similarity.
 *
 * Cosine over embeddings when EVERY candidate has one; lexical Jaccard otherwise. All-or-
 * nothing on purpose: mixing metrics across pairs would make the threshold meaningless,
 * since 0.82 cosine and 0.45 Jaccard are not the same statement about two texts and a
 * cluster built from both would be built from two different definitions of "duplicate".
 */
export function buildClusterPlan(candidates: MergeCandidate[]): ClusterPlan {
  const withEmbeddings = candidates.filter((c) => c.embedding != null && c.embedding.length > 0);
  const allEmbedded = candidates.length > 0 && withEmbeddings.length === candidates.length;

  const text = (c: MergeCandidate) => `${c.title} ${c.coreClaim}`;

  if (allEmbedded) {
    const indexClusters = clusterBySimilarity(
      candidates,
      (a, b) => cosineSimilarity(a.embedding!, b.embedding!),
      COSINE_DUPLICATE_THRESHOLD,
    );
    return {
      clusters: indexClusters.map((group) => group.map((i) => candidates[i]!.id)),
      metric: "cosine",
      degradedFromEmbeddings: false,
    };
  }

  const indexClusters = clusterBySimilarity(
    candidates,
    (a, b) => lexicalSimilarity(text(a), text(b)),
    LEXICAL_DUPLICATE_THRESHOLD,
  );
  return {
    clusters: indexClusters.map((group) => group.map((i) => candidates[i]!.id)),
    metric: "lexical",
    // Some but not all embedded means a provider exists and something went wrong for
    // part of the set — worth distinguishing from "no key at all", where zero are
    // embedded and lexical is simply the expected path.
    degradedFromEmbeddings: withEmbeddings.length > 0,
  };
}

const MERGE_SYSTEM_PROMPT = `You are choosing which lessons from one book a reader will
actually keep and review for years.

You are given a numbered list of candidate lessons already extracted from the book, and
groups of candidates that a similarity measure flagged as probable duplicates. You are
NOT given the book — you do not need it, and you must not act as though you have it.

Your job:
1. Within each duplicate group, keep AT MOST ONE candidate — the clearest and most
   complete statement of that lesson. Discard the rest.
2. Drop candidates that are trivially true, purely definitional, specific to one
   anecdote, or too vague to act on.
3. Rank what remains by how much it would change how a reader acts, most important
   first (rank 1 is the single most valuable lesson in the book).

Return only ids from the list you were given, each at most once, with a rank. Return
about the number of lessons you are asked for; returning more is harmless (the extras are
dropped by rank) and returning fewer is not, so err long. Never invent an id. You are not
asked to write anything — only to select and order.`;

export interface MergeSelection {
  /** Final ids, best first. Length is the deterministic target. */
  keepIds: number[];
  dropIds: number[];
  costUsd: number;
  /** True when the model's answer could not be used and the deterministic ordering below
   *  produced the set instead. The lessons are still real and still grounded — only the
   *  ranking is unranked-by-model. */
  degraded: boolean;
  reason: string | null;
}

/**
 * Deterministic selection when the model cannot be used at all (no key, budget, repeated
 * failure). One representative per cluster — the longest core claim, which is the most
 * complete statement of the idea and is a rule, not a judgement — then largest clusters
 * first (an idea the book states repeatedly is an idea the book is about), then by page
 * order for stability.
 *
 * This is a real degrade path, not a placeholder: a source ingested with no Anthropic key
 * for the merge step still yields a grounded, deduplicated, capped lesson set.
 */
export function deterministicSelection(
  candidates: MergeCandidate[],
  clusters: number[][],
  target: number,
): number[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));

  const representatives = clusters
    .map((cluster) => {
      const members = cluster.map((id) => byId.get(id)).filter((c): c is MergeCandidate => c != null);
      if (members.length === 0) return null;
      const best = members.reduce((a, b) => (b.coreClaim.length > a.coreClaim.length ? b : a));
      return { id: best.id, clusterSize: members.length, pageRef: best.pageRef ?? Number.MAX_SAFE_INTEGER };
    })
    .filter((r): r is { id: number; clusterSize: number; pageRef: number } => r != null);

  representatives.sort((a, b) => b.clusterSize - a.clusterSize || a.pageRef - b.pageRef || a.id - b.id);
  return representatives.slice(0, target).map((r) => r.id);
}

/**
 * The merge call, plus every deterministic guard applied to its answer.
 *
 * Guards, in order, and each one is a thing the model could otherwise get wrong:
 *   - ids not in the candidate set are discarded (it cannot invent a lesson);
 *   - a repeated id counts once;
 *   - at most one survivor per cluster, enforced here rather than trusted (the dedupe is
 *     the model's job to judge, but ours to guarantee);
 *   - the count is clamped to the computed target, truncating by the model's own rank;
 *   - if that leaves fewer than the target, the deterministic ordering backfills, so a
 *     lazy answer cannot shrink a book's library below its floor.
 */
export async function mergeAndRank(
  gateway: GatewayDeps | null,
  input: {
    userId: string;
    budgetCeilingUsd: number;
    candidates: MergeCandidate[];
    plan: ClusterPlan;
    pageCount: number | null;
  },
): Promise<MergeSelection> {
  const target = Math.min(targetLessonCount(input.pageCount), input.candidates.length);
  const allIds = new Set(input.candidates.map((c) => c.id));

  const finish = (orderedIds: number[], costUsd: number, degraded: boolean, reason: string | null): MergeSelection => {
    const keep = orderedIds.slice(0, target);
    const keepSet = new Set(keep);
    return {
      keepIds: keep,
      dropIds: input.candidates.map((c) => c.id).filter((id) => !keepSet.has(id)),
      costUsd,
      degraded,
      reason,
    };
  };

  const deterministic = deterministicSelection(input.candidates, input.plan.clusters, input.candidates.length);

  if (gateway == null) {
    return finish(deterministic, 0, true, "merge_model_unavailable: no Anthropic key configured");
  }
  if (input.candidates.length === 0) return finish([], 0, false, null);

  const userContent = JSON.stringify({
    targetLessonCount: target,
    // Never the chunk text. Title + claim is what a dedupe/rank decision needs.
    candidates: input.candidates.map((c) => ({ id: c.id, title: c.title, coreClaim: c.coreClaim, page: c.pageRef })),
    probableDuplicateGroups: input.plan.clusters.filter((cluster) => cluster.length > 1),
  });

  const result = await callLlm(gateway, {
    userId: input.userId,
    callType: "lesson_merge",
    model: MERGE_MODEL,
    systemPrompt: MERGE_SYSTEM_PROMPT,
    userContent,
    toolName: "emit_lesson_merge",
    toolInputSchema: MERGE_TOOL_SCHEMA,
    maxTokens: MERGE_MAX_TOKENS,
    budgetCeilingUsd: input.budgetCeilingUsd,
    schema: MergeResultSchema,
    estimatedInputTokens: Math.ceil(userContent.length / 4),
  });

  if (result.kind === "budgetExceeded") {
    return finish(deterministic, 0, true, "merge_budget_exceeded");
  }
  if (result.kind === "deterministicFallback") {
    return finish(deterministic, 0, true, `merge_failed: ${result.reason}`);
  }

  const clusterOf = new Map<number, number>();
  input.plan.clusters.forEach((cluster, clusterIndex) => {
    for (const id of cluster) clusterOf.set(id, clusterIndex);
  });

  const ordered = [...result.data.keep].sort((a, b) => a.rank - b.rank);
  const chosen: number[] = [];
  const seenIds = new Set<number>();
  const usedClusters = new Set<number>();

  for (const entry of ordered) {
    if (!allIds.has(entry.id) || seenIds.has(entry.id)) continue;
    const cluster = clusterOf.get(entry.id);
    if (cluster != null && usedClusters.has(cluster)) continue; // dedupe, guaranteed not trusted
    seenIds.add(entry.id);
    if (cluster != null) usedClusters.add(cluster);
    chosen.push(entry.id);
  }

  // Backfill from the deterministic ordering, still respecting one-per-cluster, so a
  // short answer cannot put a book below the floor.
  for (const id of deterministic) {
    if (chosen.length >= target) break;
    if (seenIds.has(id)) continue;
    const cluster = clusterOf.get(id);
    if (cluster != null && usedClusters.has(cluster)) continue;
    seenIds.add(id);
    if (cluster != null) usedClusters.add(cluster);
    chosen.push(id);
  }

  return finish(chosen, result.costUsd, false, null);
}
