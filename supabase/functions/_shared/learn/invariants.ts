// The write-time quality gates — ported from ULM's `packages/core/src/ingestion/invariants.ts`
// (ADR-011), thresholds and calibration notes intact.
//
// WHY THESE ARE PORTED RATHER THAN REINVENTED. Every threshold here was calibrated against
// measured distributions on real books, and several exist because a specific bad output reached a
// database and was read by a person. That is knowledge no amount of reasoning reproduces: the
// numbers are cheap, the incidents that produced them are not. Where a comment records what was
// measured, it is kept verbatim.
//
// THE STANDING LESSON BEHIND ADR-011, which is the reason this file exists at all:
//
//   > An invariant that can pass for a degenerate reason is not an invariant.
//
// "24/24 provenance passed" was true both when the claim was a verbatim copy of the quote (nothing
// was generated, so there was nothing to check) and when a real quote was bolted onto an unrelated
// claim (string matching, not grounding). Ask of every gate: what is the cheapest way for output
// to satisfy this while still being wrong?
//
// OUR ADAPTATION. Their gates split into two families, and only one of them can run here today:
//
//   * LEXICAL gates (anti-leak, claim≠quote, language sanity, card-text sanity) need no
//     embeddings. They run unconditionally, on every provider's output, always.
//   * SEMANTIC gates (mechanism relevance, claim↔provenance relevance, title↔claim relevance,
//     topicality) need embeddings. Under D41 the embeddings key may be absent — so each takes an
//     explicit `unknown` result rather than defaulting to pass. A gate that silently passes when
//     it cannot run is worse than no gate: it reports a guarantee it did not check.

import type { CandidateLesson } from "./types.ts";
import { normalizeForQuoteMatch } from "./provenance.ts";

const STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "at", "for",
  "with", "by", "from", "as", "is", "are", "was", "were", "be", "been", "being",
  "this", "that", "these", "those", "it", "its", "you", "your", "we", "our",
  "they", "their", "he", "she", "his", "her", "not", "no", "do", "does", "did",
  "can", "could", "will", "would", "should", "may", "might", "must", "have",
  "has", "had", "if", "then", "than", "so", "because", "which", "who", "what",
  "when", "where", "why", "how", "there", "here", "all", "any", "one", "into",
]);

function contentWords(text: string): Set<string> {
  const words = text.match(/[A-Za-z][A-Za-z'-]{2,}/g) ?? [];
  return new Set(words.map((w) => w.toLowerCase()).filter((w) => !STOPWORDS.has(w)));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const w of a) if (b.has(w)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * A semantic gate's verdict.
 *
 * `unknown` is the state D41 forces into existence and it is deliberately NOT a pass. With no
 * embeddings key these gates cannot run, and a caller must decide what to do about that with the
 * fact in hand — never receive a `true` that means "not checked".
 */
export type GateVerdict =
  | { verdict: "pass"; similarity: number }
  | { verdict: "fail"; similarity: number }
  | { verdict: "unknown" };

function judge(similarity: number, floor: number): GateVerdict {
  return similarity >= floor
    ? { verdict: "pass", similarity }
    : { verdict: "fail", similarity };
}

// ---------------------------------------------------------------------------
// Lexical gates — always run
// ---------------------------------------------------------------------------

// Tightened 0.35 -> 0.28 in the source project after review: "What is the main idea ... through
// controlling and shaping your thoughts?" scored under 0.35 but still handed over most of the
// answer's content words.
export const ANTI_LEAK_JACCARD_CEILING = 0.28;

/**
 * Gate 1 — a card whose prompt contains most of its answer's content words defeats retrieval
 * practice, which is the product's entire thesis. A card that leaks its answer must never reach
 * the database.
 */
export function passesAntiLeak(prompt: string, answer: string): { passed: boolean; overlap: number } {
  const overlap = jaccard(contentWords(prompt), contentWords(answer));
  return { passed: overlap < ANTI_LEAK_JACCARD_CEILING, overlap };
}

// Calibrated against a real near-copy the substring check missed: the quote's two sentences merged
// into one participial clause scored 0.846 content-word overlap. A genuine paraphrase pair scored
// 0.063. 0.5 sits far from both.
export const CLAIM_QUOTE_JACCARD_CEILING = 0.5;

/**
 * Gate 2 — `coreClaim` must not be a near-copy of `provenanceQuote`, which forces transformation
 * rather than selection.
 *
 * This is the gate that measured the source project's keyless heuristic provider at 3/10: a pure
 * selection strategy fails it BY CONSTRUCTION, because its claim is the quote. That is the correct
 * and honest outcome rather than a bug in the gate — and it is the evidence behind D45's ruling
 * that extraction refuses rather than degrades.
 *
 * The substring check alone is insufficient: two sentences from the quote merged into one clause
 * is not a substring match but is exactly the "quote with words swapped" the prompt warns against.
 */
export function passesClaimNotQuote(candidate: CandidateLesson): boolean {
  const claim = normalizeForQuoteMatch(candidate.coreClaim);
  const quote = normalizeForQuoteMatch(candidate.provenanceQuote);
  if (claim.length === 0) return false;
  if (claim === quote || claim.includes(quote) || quote.includes(claim)) return false;
  return jaccard(contentWords(candidate.coreClaim), contentWords(candidate.provenanceQuote)) <
    CLAIM_QUOTE_JACCARD_CEILING;
}

// Observed live in the source project: a 7B model code-switched into Chinese mid-sentence in one
// lesson out of fourteen on its first real run. Rare, real, and it looks broken to a user.
const NON_LATIN_SCRIPT = /[一-鿿぀-ヿ가-힯]/;

/** Gate 3 — only a generative provider can fail this; extracted source text structurally cannot. */
export function passesLanguageSanity(text: string): boolean {
  return !NON_LATIN_SCRIPT.test(text);
}

// Leaked prompt scaffolding that reached a real database verbatim, where a user would have read it:
// "How would you use self-control as outlined in application answer:".
const TEMPLATE_ARTIFACT_PATTERNS = [
  /\bapplication[_\s]answer\b/i,
  /\bcore[_\s]claim\b/i,
  /\bfree[_\s]recall[_\s]prompt\b/i,
  /\bwhy[_\s]prompt\b/i,
  /\bas outlined in\b/i,
  /\baccording to the (json|schema|format)\b/i,
  /\bclaim[_\s]to[_\s]task\b/i,
];

const QUESTION_START =
  /^(what|why|how|who|when|where|which|do|does|did|can|could|would|should|is|are|will)\b/i;

// A garbled cloze reached a database with two unresolved candidate fillers side by side: "What
// does this lesson say about conclusions / detrimental?" It passed every other check — no leaked
// scaffolding, ends with "?", starts with a question word — because none of them look at
// word-level coherence. Space-slash-space is the tell: legitimate English slash idioms ("and/or",
// "km/h") carry no surrounding spaces, so " / " is what an unresolved candidate list looks like
// once serialised.
const SPACED_SLASH_ARTIFACT = /\s\/\s/;

/**
 * The scaffolding checks, shared by everything user-facing.
 *
 * Split out from the full sentence gate below because applying the sentence rules to a TITLE is
 * wrong, and porting them wholesale broke every fixture in this repo before it broke anything real.
 * A lesson title is a headline — "Use the 2-minute rule to start" — and terminal punctuation on one
 * would be a typo, not a fix. What titles and sentences share is that neither may contain leaked
 * template scaffolding or an unresolved candidate list.
 */
function passesScaffoldingChecks(trimmed: string): boolean {
  if (trimmed.length === 0) return false;
  if (TEMPLATE_ARTIFACT_PATTERNS.some((p) => p.test(trimmed))) return false;
  // A bare trailing colon is the exact shape of the leak that motivated this gate.
  if (/:\s*$/.test(trimmed)) return false;
  if (SPACED_SLASH_ARTIFACT.test(trimmed)) return false;
  return true;
}

/** Gate 4a — a lesson title: a headline, so no terminal-punctuation requirement. */
export function passesTitleSanity(text: string): boolean {
  return passesScaffoldingChecks(text.trim());
}

/**
 * Gate 4 — card prompts and core claims must read as finished human-facing prose.
 *
 * These ARE sentences, so the sentence rules apply: something phrased as a question ends with a
 * question mark rather than trailing off mid-clause, and everything ends in real punctuation.
 */
export function passesCardTextSanity(text: string): boolean {
  const trimmed = text.trim();
  if (!passesScaffoldingChecks(trimmed)) return false;
  if (QUESTION_START.test(trimmed) && !trimmed.endsWith("?")) return false;
  if (!/[.?!]$/.test(trimmed)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Semantic gates — run only when embeddings exist (D41)
// ---------------------------------------------------------------------------

// CALIBRATED against measured cosine similarity across all 17 lessons in two review decks. Scores
// ranged 0.180-0.740. The severe case -- a "two-minute rule" claim grounded in an unrelated
// social-comparison quote -- scored 0.180, an isolated outlier with a real gap to the next-lowest
// (0.337). 0.30 sits in that gap.
//
// IMPORTANT LIMITATION, found by reading the mid-range scores rather than assuming: a second bad
// case (a multitasking claim grounded in a quote about environmental distractions) scored 0.366,
// inside the range of several manually-verified GOOD lessons (0.337-0.433, legitimate abstract
// paraphrases). Cosine similarity alone cannot separate "related topic, wrong claim" from
// "different phrasing, same claim". Raising the floor to catch the second case would drop lessons
// confirmed good by hand. That failure mode needs a prompt-level fix -- requiring the model to
// quote the sentence it actually derived the claim from -- not a statistical threshold.
export const CLAIM_PROVENANCE_RELEVANCE_FLOOR = 0.3;

/**
 * Gate 5, and the critical one.
 *
 * A verbatim substring match proves a quote came from the source text. It never proves the quote
 * SUPPORTS the claim attached to it — a verbatim-but-unrelated quote sails through the
 * hallucination firewall looking identical, in any audit, to a genuinely grounded one. This is
 * semantic relevance between a claim and its own quote, layered on top of the verbatim check and
 * never instead of it.
 */
export function passesClaimProvenanceRelevance(
  claimEmbedding: number[] | null,
  quoteEmbedding: number[] | null,
): GateVerdict {
  if (!claimEmbedding || !quoteEmbedding) return { verdict: "unknown" };
  return judge(cosineSimilarity(claimEmbedding, quoteEmbedding), CLAIM_PROVENANCE_RELEVANCE_FLOOR);
}

export const MECHANISM_RELEVANCE_FLOOR = 0.25;

/**
 * Gate 6 — catches a mechanism topically unrelated to its claim, which is what taking "the next N
 * sentences" regardless of topical continuity produces. The source project's example: a health
 * claim paired with a mechanism about an employer underpaying workers.
 */
export function passesMechanismRelevance(
  claimEmbedding: number[] | null,
  mechanismEmbedding: number[] | null,
): GateVerdict {
  if (!claimEmbedding || !mechanismEmbedding) return { verdict: "unknown" };
  return judge(cosineSimilarity(claimEmbedding, mechanismEmbedding), MECHANISM_RELEVANCE_FLOOR);
}

export const TITLE_CLAIM_RELEVANCE_FLOOR = 0.25;

/** Gate 7 — a title must not drift to a different topic than its own claim. */
export function passesTitleClaimRelevance(
  titleEmbedding: number[] | null,
  claimEmbedding: number[] | null,
): GateVerdict {
  if (!titleEmbedding || !claimEmbedding) return { verdict: "unknown" };
  return judge(cosineSimilarity(titleEmbedding, claimEmbedding), TITLE_CLAIM_RELEVANCE_FLOOR);
}

// Calibrated against four real prompt/claim pairs: a vague prompt ("What is the main idea of the
// lesson?") scored 0.300; two genuinely good topic-anchored prompts scored 0.524 and 0.684. 0.40
// sits cleanly between them.
export const TOPICALITY_FLOOR = 0.4;

/**
 * Gate 8 — the companion to anti-leak, not a replacement.
 *
 * Sessions interleave across sources, so a user meets a card cold with no idea which lesson is
 * being asked about. Anti-leak alone over-corrects into prompts so vague they are unanswerable
 * ("What is the main idea of the lesson?" passes anti-leak trivially and fails this). The
 * requirement is a BAND: topically anchored above this floor AND lexically distinct below
 * anti-leak's ceiling. Both, checked independently.
 */
export function passesTopicality(
  promptEmbedding: number[] | null,
  claimEmbedding: number[] | null,
): GateVerdict {
  if (!promptEmbedding || !claimEmbedding) return { verdict: "unknown" };
  return judge(cosineSimilarity(promptEmbedding, claimEmbedding), TOPICALITY_FLOOR);
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

/**
 * What each gate dropped, per book.
 *
 * Counted rather than merely logged because a gate with no counter cannot be calibrated later, and
 * because a sudden change in a drop rate is the earliest signal that a model's behaviour moved.
 * `*Unknown` counters exist so "we could not check" never hides inside "passed" — the number that
 * would otherwise make a keyless run look as verified as a keyed one.
 */
export interface InvariantCounters {
  antiLeakDropped: number;
  claimEqualsQuoteDropped: number;
  languageSanityDropped: number;
  cardTextSanityDropped: number;
  claimProvenanceIrrelevantDropped: number;
  claimProvenanceUnknown: number;
  mechanismIrrelevantFlagged: number;
  mechanismUnknown: number;
  titleClaimIrrelevantDropped: number;
  titleClaimUnknown: number;
  topicalityFailedDropped: number;
  topicalityUnknown: number;
}

export function newInvariantCounters(): InvariantCounters {
  return {
    antiLeakDropped: 0,
    claimEqualsQuoteDropped: 0,
    languageSanityDropped: 0,
    cardTextSanityDropped: 0,
    claimProvenanceIrrelevantDropped: 0,
    claimProvenanceUnknown: 0,
    mechanismIrrelevantFlagged: 0,
    mechanismUnknown: 0,
    titleClaimIrrelevantDropped: 0,
    titleClaimUnknown: 0,
    topicalityFailedDropped: 0,
    topicalityUnknown: 0,
  };
}
