// Triage (cheap) -> extraction (mid) -> THE PROVENANCE GATE. Every model call here goes
// through callLlm; nothing in this file knows what a provider is.

import type { GatewayDeps } from "../llm/gateway.ts";
import { callLlm } from "../llm/gateway.ts";
import { verifyQuoteInChunk, type QuoteRejection } from "./provenance.ts";
import {
  EXTRACTION_TOOL_SCHEMA,
  ExtractionResultSchema,
  TRIAGE_TOOL_SCHEMA,
  TriageResultSchema,
  type CandidateLesson,
} from "./types.ts";

const TRIAGE_MODEL = "claude-haiku-4-5" as const;
const EXTRACTION_MODEL = "claude-sonnet-5" as const;

/** Triage answers one boolean per chunk; 64 tokens per chunk is generous for that. */
const TRIAGE_MAX_TOKENS = 1_024;
/** A dense chunk yields at most a handful of lessons, each a few sentences. */
const EXTRACTION_MAX_TOKENS = 2_048;

export interface ChunkForModel {
  id: number;
  text: string;
  pageStart: number | null;
  pageEnd: number | null;
}

const TRIAGE_SYSTEM_PROMPT = `You are a gate in front of an expensive extraction step.
For each numbered passage from a business or self-improvement book, answer ONE question:
does this passage contain at least one transferable lesson — a claim about how to act,
think, or decide that a reader could apply — stated explicitly enough to quote?

Say false for: front matter, dedications, acknowledgements, tables of contents,
bibliographies, indexes, chapter recaps that only restate, pure narrative with no stated
principle, exercises, and transitional prose. Say true when the passage states a
principle, a mechanism, a rule, or a study's conclusion.

Answer for EVERY index you are given, exactly once. When genuinely unsure, say true —
a passage wrongly sent forward costs one extraction call, while a passage wrongly
dropped is a lesson the reader never sees.`;

const EXTRACTION_SYSTEM_PROMPT = `You extract transferable lessons from one passage of a
business or self-improvement book.

A lesson is ONE idea a reader could act on. Write the title as an imperative where the
passage supports it ("Use the two-minute rule to start", not "On starting"). coreClaim is
what the passage asserts, in one or two sentences. mechanism is WHY it works, if the
passage says; null if it does not. claimToTask is a concrete thing the reader could try
this week, if the lesson implies one; null otherwise. evidenceStrength describes what the
passage rests on: author_anecdote, single_study, or strong_research — null when the
passage gives no basis at all.

provenanceQuote is the single most important field. It MUST be copied VERBATIM from the
passage you were given — an unbroken run of at least a full clause, long enough to stand
on its own. Do not paraphrase it, do not stitch two sentences together, do not tidy it,
do not translate it. It is checked character by character against the passage, and any
lesson whose quote is not found there is discarded along with everything you wrote about
it. If a lesson you can see cannot be supported by a quotable passage, do not return it.

Return 0 to 4 lessons. Zero is a correct answer for a passage that only restates or
narrates. Never invent a lesson to fill the list.`;

// ============================================================================
// Triage
// ============================================================================

export type TriageOutcome =
  | { kind: "ok"; keepIds: number[]; costUsd: number; degraded: false }
  /** Budget or model failure. `keepIds` is EVERY chunk in the batch — see the comment on
   *  `triageChunks`. */
  | { kind: "degraded"; keepIds: number[]; costUsd: number; degraded: true; reason: string };

/**
 * One cheap call decides a whole batch.
 *
 * ON FAILURE, EVERY CHUNK PASSES. This is the important decision in the file. A triage
 * failure is an infrastructure event; letting it silently delete a chapter's worth of
 * lessons would make an outage indistinguishable from a boring book, and the user would
 * never learn which they got. Failing OPEN costs money (extraction runs on prose that
 * would have been filtered) and is recorded as `degraded` so the cost is attributable.
 * Failing closed would cost content, silently. Budget exhaustion takes the same path:
 * the caller checks the budget again on the extraction call, where refusing is honest
 * because it refuses the whole step rather than a subset of it.
 */
export async function triageChunks(
  gateway: GatewayDeps,
  input: { userId: string; budgetCeilingUsd: number; chunks: ChunkForModel[] },
): Promise<TriageOutcome> {
  const allIds = input.chunks.map((c) => c.id);
  if (input.chunks.length === 0) return { kind: "ok", keepIds: [], costUsd: 0, degraded: false };

  const userContent = input.chunks
    .map((chunk, index) => `<<PASSAGE ${index}>>\n${chunk.text}`)
    .join("\n\n");

  const result = await callLlm(gateway, {
    userId: input.userId,
    callType: "lesson_triage",
    model: TRIAGE_MODEL,
    systemPrompt: TRIAGE_SYSTEM_PROMPT,
    userContent,
    toolName: "emit_lesson_triage",
    toolInputSchema: TRIAGE_TOOL_SCHEMA,
    maxTokens: TRIAGE_MAX_TOKENS,
    budgetCeilingUsd: input.budgetCeilingUsd,
    schema: TriageResultSchema,
    estimatedInputTokens: Math.ceil(userContent.length / 4),
  });

  if (result.kind === "budgetExceeded") {
    return { kind: "degraded", keepIds: allIds, costUsd: 0, degraded: true, reason: "triage_budget_exceeded" };
  }
  if (result.kind === "deterministicFallback") {
    return { kind: "degraded", keepIds: allIds, costUsd: 0, degraded: true, reason: `triage_failed: ${result.reason}` };
  }

  const keepIds: number[] = [];
  const answered = new Set<number>();
  for (const verdict of result.data.chunks) {
    const chunk = input.chunks[verdict.index];
    if (!chunk) continue; // an index we never sent — ignored, never guessed at
    if (answered.has(verdict.index)) continue; // first answer wins; a repeat is noise
    answered.add(verdict.index);
    if (verdict.hasLessons) keepIds.push(chunk.id);
  }
  // A chunk the model simply did not mention has NOT been judged. Same argument as the
  // failure path: silence is not a "no".
  for (let index = 0; index < input.chunks.length; index++) {
    if (!answered.has(index)) keepIds.push(input.chunks[index]!.id);
  }

  keepIds.sort((a, b) => a - b);
  return { kind: "ok", keepIds, costUsd: result.costUsd, degraded: false };
}

// ============================================================================
// Extraction + the gate
// ============================================================================

export interface VerifiedLesson {
  chunkId: number;
  title: string;
  coreClaim: string;
  mechanism: string | null;
  claimToTask: string | null;
  evidenceStrength: CandidateLesson["evidenceStrength"];
  /** The CHUNK's own substring — never the model's rendition of it. */
  provenanceQuote: string;
  /** Derived from the chunk's page span, never from the model. */
  pageRef: number | null;
}

export interface DroppedCandidate {
  chunkId: number;
  title: string;
  reason: QuoteRejection;
}

export type ExtractOutcome =
  | { kind: "ok"; lessons: VerifiedLesson[]; dropped: DroppedCandidate[]; costUsd: number }
  | { kind: "budgetExceeded" }
  | { kind: "failed"; reason: string };

/**
 * Extract from ONE chunk, then run every candidate through the provenance gate before it
 * can become a row.
 *
 * The gate is applied HERE, in the ingestion code, and not delegated to the prompt or to
 * the NOT NULL constraint. The prompt asks for a verbatim quote; this function checks.
 */
export async function extractLessonsFromChunk(
  gateway: GatewayDeps,
  input: { userId: string; budgetCeilingUsd: number; chunk: ChunkForModel },
): Promise<ExtractOutcome> {
  const result = await callLlm(gateway, {
    userId: input.userId,
    callType: "lesson_extraction",
    model: EXTRACTION_MODEL,
    systemPrompt: EXTRACTION_SYSTEM_PROMPT,
    userContent: input.chunk.text,
    toolName: "emit_lesson_candidates",
    toolInputSchema: EXTRACTION_TOOL_SCHEMA,
    maxTokens: EXTRACTION_MAX_TOKENS,
    budgetCeilingUsd: input.budgetCeilingUsd,
    schema: ExtractionResultSchema,
    estimatedInputTokens: Math.ceil(input.chunk.text.length / 4),
  });

  if (result.kind === "budgetExceeded") return { kind: "budgetExceeded" };
  if (result.kind === "deterministicFallback") return { kind: "failed", reason: result.reason };

  const lessons: VerifiedLesson[] = [];
  const dropped: DroppedCandidate[] = [];

  for (const candidate of result.data.lessons) {
    const verification = verifyQuoteInChunk(candidate.provenanceQuote, input.chunk.text);
    if (!verification.ok) {
      dropped.push({ chunkId: input.chunk.id, title: candidate.title, reason: verification.reason });
      continue;
    }
    lessons.push({
      chunkId: input.chunk.id,
      title: candidate.title,
      coreClaim: candidate.coreClaim,
      mechanism: candidate.mechanism,
      claimToTask: candidate.claimToTask,
      evidenceStrength: candidate.evidenceStrength,
      provenanceQuote: verification.quote,
      // The chunk knows what pages it spans; the model does not, and a page number it
      // invented would be a citation pointing at the wrong place — a subtler version of
      // the fabricated quote this whole module exists to stop.
      pageRef: input.chunk.pageStart ?? null,
    });
  }

  return { kind: "ok", lessons, dropped, costUsd: result.costUsd };
}
