// Cards — the step that turns a grounded lesson into something a five-minute session can
// actually show. Until this file existed the pipeline extracted lessons and stopped, so
// `lesson_cards` was written by nothing and `sources.status = 'partial'` (which fires on lessons
// that have SERVABLE CARDS) could never be reached by any book.
//
// D45 SPLITS THIS FILE IN HALF, and the split is the ruling rather than an implementation detail:
//
//   * CLOZE IS DETERMINISTIC, ALWAYS — with a key and without one. Blanking one meaningful term
//     out of the lesson's own core claim is a transformation a rule can do correctly, every time,
//     for free. That is what "the heuristic floor, not an apology" means: this card is not a
//     degraded version of a better card a model would have written, it is the same card.
//
//   * FREE_RECALL / APPLICATION / WHY NEED THE MODEL, and with no key this half REFUSES. ULM
//     measured its keyless heuristic card writer and the finding is the whole reason for the
//     split: its prompts CONTAINED THEIR OWN ANSWERS, which is fatal when retrieval practice is
//     the entire thesis. A deck of nothing but fill-in-the-blank cards is recognition practice
//     wearing a recall costume, and shipping one would be invisible to the user at the moment it
//     happened and only legible months later as "this app taught me nothing".
//
// Every model call goes through `callLlm` (D9). Nothing in this file knows what a provider is.
//
// THE BAND, which is the reason two gates run instead of one. Anti-leak alone is trivially
// satisfiable by a prompt so vague it is unanswerable — "What is the main idea of the lesson?"
// leaks nothing at all and teaches nothing at all. Topicality alone is trivially satisfiable by a
// prompt that simply restates the claim. The requirement is BOTH, checked independently:
// topically anchored above `TOPICALITY_FLOOR` AND lexically distinct below
// `ANTI_LEAK_JACCARD_CEILING`. Neither is the other's proxy.

import { embedTexts } from "../embeddings/embed.ts";
import type { EmbeddingsProvider } from "../embeddings/types.ts";
import type { GatewayDeps } from "../llm/gateway.ts";
import { callLlm } from "../llm/gateway.ts";
import {
  STOPWORDS,
  passesAntiLeak,
  passesCardTextSanity,
  passesLanguageSanity,
  passesTitleSanity,
  passesTopicality,
  type InvariantCounters,
} from "./invariants.ts";
import {
  CARD_GENERATION_TOOL_SCHEMA,
  CardGenerationResultSchema,
  MAX_CARDS_PER_LESSON,
  MIN_CARDS_PER_LESSON,
  type LessonPromptType,
} from "./types.ts";

const CARD_MODEL = "claude-sonnet-5" as const;

/** Three cards of a few sentences each, plus the tool envelope. */
const CARD_MAX_TOKENS = 1_536;

/** What the card writer is given. Deliberately the LESSON and never the chunk: everything here
 *  has already been through the provenance gate, so there is no channel by which card generation
 *  could introduce ungrounded content. */
export interface LessonForCards {
  id: number;
  title: string;
  coreClaim: string;
  mechanism: string | null;
  claimToTask: string | null;
  provenanceQuote: string;
}

export interface GeneratedCard {
  promptType: LessonPromptType;
  prompt: string;
  answer: string;
  sortOrder: number;
}

// ============================================================================
// The deterministic half — cloze
// ============================================================================

export const CLOZE_BLANK = "_____";

/**
 * Shortest term the cloze rule will blank.
 *
 * Four characters, chosen against the failure it prevents rather than as a round number: under
 * four, English is almost entirely function words and the handful of content words that short
 * ("goal", "risk") are already at the boundary. A three-letter blank is a guessing game about
 * grammar, not a retrieval of the lesson's idea.
 */
export const MIN_CLOZE_TERM_CHARS = 4;

/** Letters first, then letters/digits/apostrophes/hyphens — the shape of an English word as a PDF
 *  text layer and a model both spell it. */
const WORD_PATTERN = /[\p{L}][\p{L}\p{N}'’-]*/gu;

interface ClaimWord {
  text: string;
  start: number;
  end: number;
}

function scanWords(text: string): ClaimWord[] {
  const words: ClaimWord[] = [];
  WORD_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WORD_PATTERN.exec(text)) != null) {
    words.push({ text: match[0], start: match.index, end: match.index + match[0].length });
  }
  return words;
}

export type ClozeRejection = "no_eligible_term";

export type ClozeResult =
  | { ok: true; prompt: string; answer: string; term: string }
  | { ok: false; reason: ClozeRejection };

/**
 * THE CLOZE TERM SELECTION RULE, stated once and in one place.
 *
 * A word from the claim is ELIGIBLE only if all five hold:
 *
 *   1. It is not the FIRST word of the claim and not the LAST. The first word is usually the
 *      imperative verb or the subject, and blanking it leaves a sentence with no grammatical
 *      anchor to read at all; the last word carries the terminal punctuation, and blanking it
 *      would strip the "." that `passesCardTextSanity` requires — a gate failing on our own
 *      formatting rather than on the card's quality.
 *   2. It is NOT A STOPWORD, tested against `invariants.ts`'s exported `STOPWORDS` — the very
 *      set anti-leak ignores when it measures overlap. That shared list is the point: a blanked
 *      stopword would score zero overlap and sail through anti-leak while asking the reader to
 *      recall the word "the".
 *   3. It is at least `MIN_CLOZE_TERM_CHARS` long.
 *   4. It occurs EXACTLY ONCE in the claim, case-insensitively. A term that appears twice would
 *      have its other occurrence sitting in the prompt beside the blank — the answer printed on
 *      the question, which is the precise failure anti-leak exists to catch. Excluding repeats
 *      here means the cloze card cannot construct that failure in the first place.
 *   5. It contains a letter (guaranteed by the pattern — a bare number is not a term).
 *
 * Among the eligible words the rule picks the LONGEST, ties broken by the earliest position. A
 * rule, not a judgement, in the same spirit as the merge pass's "longest core claim wins":
 * length is a cheap, stable proxy for specificity, and any tie-break that depended on the model
 * would put a model back inside the deterministic half.
 *
 * WHY IT CANNOT PICK A STOPWORD: the stopword test is a FILTER on the candidate pool, applied
 * before any scoring happens. Selection only ever draws from words that already passed it, so
 * there is no ranking outcome, no tie, and no empty-pool fallback that can reach a stopword. An
 * empty pool returns a rejection and the lesson simply gets no cloze card.
 */
export function buildClozeCard(coreClaim: string): ClozeResult {
  const words = scanWords(coreClaim);
  if (words.length < 3) return { ok: false, reason: "no_eligible_term" };

  const occurrences = new Map<string, number>();
  for (const word of words) {
    const key = word.text.toLowerCase();
    occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
  }

  const eligible = words.filter((word, index) => {
    if (index === 0 || index === words.length - 1) return false; // rule 1
    const key = word.text.toLowerCase();
    if (STOPWORDS.has(key)) return false; // rule 2 — the filter, before any scoring
    if (word.text.length < MIN_CLOZE_TERM_CHARS) return false; // rule 3
    if ((occurrences.get(key) ?? 0) !== 1) return false; // rule 4
    return true;
  });

  if (eligible.length === 0) return { ok: false, reason: "no_eligible_term" };

  const chosen = eligible.reduce((best, word) =>
    word.text.length > best.text.length ? word : best
  );

  return {
    ok: true,
    prompt: `${coreClaim.slice(0, chosen.start)}${CLOZE_BLANK}${coreClaim.slice(chosen.end)}`,
    answer: chosen.text,
    term: chosen.text,
  };
}

// ============================================================================
// The model half — free_recall, application, why
// ============================================================================

const CARD_SYSTEM_PROMPT = `You write retrieval-practice cards for ONE lesson a reader has
already saved from a business or self-improvement book. The reader will meet these cards weeks
later, interleaved with cards from other books, with no idea which lesson is coming.

Write exactly three cards, one of each type:

- free_recall: asks the reader to reconstruct the lesson's claim from memory. This is the most
  important card. The answer is the claim, stated fully in the reader's terms.
- application: puts the reader in a concrete, ordinary situation and asks what they would do.
  The answer is the action the lesson implies, and why that action follows from it.
- why: asks for the mechanism — why this works, or why the obvious alternative fails. The answer
  explains the reasoning, not just the conclusion.

TWO RULES DECIDE WHETHER A CARD IS KEPT, and they pull against each other deliberately:

1. THE PROMPT MUST NOT CONTAIN ITS OWN ANSWER. A prompt that hands over the conclusion is not a
   card; the reader recognises it and learns nothing. Never state the claim in the prompt. Never
   name the technique and then ask what the technique does.
2. THE PROMPT MUST NAME WHAT IT IS ASKING ABOUT. The reader has no context — sessions interleave
   many books. "What is the main idea of the lesson?" and "What did the author argue?" are
   REJECTED: they leak nothing and they are unanswerable. Anchor the prompt in the lesson's
   subject matter.

Together: use the lesson's SUBJECT in the prompt and none of its CONCLUSION.

Prompts are one finished sentence ending in "?" (or in "." if phrased as an instruction).
Answers are one to three sentences of finished prose ending in punctuation. Write plain English.

Never refer to "the lesson", "the passage", "the text", "the author" or "the book" — the reader
is being asked about the world, not about a document. Never write a fill-in-the-blank card;
those are generated separately and one from you would be discarded.`;

function buildUserContent(lesson: LessonForCards): string {
  // A JSON envelope rather than prose, so a lesson whose own text contains a line like
  // "Answer:" cannot read as an instruction to the model.
  return JSON.stringify({
    title: lesson.title,
    coreClaim: lesson.coreClaim,
    mechanism: lesson.mechanism,
    suggestedAction: lesson.claimToTask,
    groundingPassage: lesson.provenanceQuote,
  });
}

// ============================================================================
// Outcomes
// ============================================================================

/**
 * Why one card was dropped before insert.
 *
 * `topicality_unknown` is NOT in this union, and its absence is deliberate: an unchecked gate is
 * not a drop. See `applyGates` for what happens instead.
 */
export type CardDropReason = "language_sanity" | "text_sanity" | "anti_leak" | "topicality";

export interface DroppedCard {
  lessonId: number;
  promptType: LessonPromptType;
  reason: CardDropReason;
}

export type CardGenerationOutcome =
  | {
    kind: "ok";
    /** Empty when the surviving set could not satisfy the composition rule. A lesson with no
     *  cards is not an error — it is a lesson this pass could not write a usable deck for, and
     *  saying so beats storing a card that defeats retrieval practice. */
    cards: GeneratedCard[];
    dropped: DroppedCard[];
    costUsd: number;
    /** False when there were no embeddings, so topicality could not run on ANY card here.
     *  Recorded rather than inferred: "we could not check" must never read as "we checked". */
    topicalityChecked: boolean;
  }
  | { kind: "budgetExceeded" }
  | { kind: "failed"; reason: string };

/**
 * The order cards are written in, and therefore the order a session shows them.
 *
 * A fixed rule rather than the model's ordering, because `sort_order` is a stored column and a
 * deck whose order depends on which cards happened to survive the gates would shuffle itself
 * between two books for no reason a reader could see. free_recall leads because it carries the
 * retrieval load; cloze follows as the lower-effort generation-effect card; application and why
 * close, since both are easier once the claim itself has been recalled.
 */
const TYPE_ORDER: LessonPromptType[] = ["free_recall", "cloze", "application", "why"];

interface CardCandidate {
  promptType: LessonPromptType;
  prompt: string;
  answer: string;
}

/**
 * Every write-time gate, applied to one lesson's candidate cards.
 *
 * Ordered cheapest-first, and each drop is counted in the shared `InvariantCounters` — a gate
 * with no counter cannot be calibrated later, and a shift in the MIX of drop reasons is the
 * earliest signal that a model's behaviour moved.
 */
function applyGates(
  lessonId: number,
  candidates: CardCandidate[],
  vectors: { claim: number[] | null; prompts: Array<number[] | null> },
  counters: InvariantCounters,
): { kept: CardCandidate[]; dropped: DroppedCard[] } {
  const kept: CardCandidate[] = [];
  const dropped: DroppedCard[] = [];

  candidates.forEach((card, index) => {
    const drop = (reason: CardDropReason) => dropped.push({ lessonId, promptType: card.promptType, reason });

    if (!passesLanguageSanity(card.prompt) || !passesLanguageSanity(card.answer)) {
      counters.languageSanityDropped++;
      drop("language_sanity");
      return;
    }

    // The PROMPT is always a sentence, so it always takes the full sentence gate.
    //
    // The ANSWER takes the full gate too — EXCEPT for cloze, whose answer is a single blanked
    // term and is structurally not a sentence. Applying the sentence rules to it would demand
    // terminal punctuation on the word "friction" and drop 100% of cloze cards on a rule about
    // formatting. That is the same split invariants.ts already makes for lesson TITLES, and for
    // the same stated reason; what the two halves share — no leaked template scaffolding, no
    // unresolved " / " candidate list — is exactly what `passesTitleSanity` checks, so the cloze
    // answer is checked by that half rather than exempted from checking.
    const answerOk = card.promptType === "cloze"
      ? passesTitleSanity(card.answer)
      : passesCardTextSanity(card.answer);
    if (!passesCardTextSanity(card.prompt) || !answerOk) {
      counters.cardTextSanityDropped++;
      drop("text_sanity");
      return;
    }

    // Half the band: a card that hands over its answer defeats retrieval practice.
    if (!passesAntiLeak(card.prompt, card.answer).passed) {
      counters.antiLeakDropped++;
      drop("anti_leak");
      return;
    }

    // The other half, and it is the half that catches the OVER-correction: a prompt driven so far
    // from its answer that it is about nothing. Checked independently of anti-leak, never derived
    // from it.
    const verdict = passesTopicality(vectors.prompts[index] ?? null, vectors.claim);
    if (verdict.verdict === "fail") {
      counters.topicalityFailedDropped++;
      drop("topicality");
      return;
    }
    if (verdict.verdict === "unknown") {
      // D41's state, and it is COUNTED AS UNKNOWN — never as a pass. The card is still written,
      // because refusing every card whenever VOYAGE_API_KEY is absent would make a second vendor's
      // credential a hard dependency of the Learn pillar, which D41 explicitly rules it is not.
      // What is NOT done is the thing that would actually be dishonest: letting this increment
      // nothing, so a keyless book looks as verified as a keyed one in the only record anybody
      // reads. The number is on the job, and it is the number that says which is which.
      counters.topicalityUnknown++;
    }

    kept.push(card);
  });

  return { kept, dropped };
}

/**
 * THE COMPOSITION RULE, applied after the gates rather than requested from the model.
 *
 * A deck must contain at least one `free_recall` card — the generation effect is the entire
 * reason this pillar exists, and a lesson whose only survivors are a cloze and an application
 * card asks the reader to recognise and to transfer but never to RECONSTRUCT. It must also
 * contain at least one card that is not `free_recall`, because a lesson asked one way every time
 * trains the phrasing rather than the idea.
 *
 * A set that cannot satisfy both is returned EMPTY rather than padded. Padding is what produces a
 * library full of cards nobody can stand behind, one lesson at a time.
 */
function composeDeck(kept: CardCandidate[]): GeneratedCard[] {
  const byType = new Map<LessonPromptType, CardCandidate>();
  for (const card of kept) if (!byType.has(card.promptType)) byType.set(card.promptType, card);

  const ordered = TYPE_ORDER.filter((type) => byType.has(type)).map((type) => byType.get(type)!);

  const hasFreeRecall = ordered.some((card) => card.promptType === "free_recall");
  const hasNonRecall = ordered.some((card) => card.promptType !== "free_recall");
  if (!hasFreeRecall || !hasNonRecall) return [];
  if (ordered.length < MIN_CARDS_PER_LESSON) return [];

  return ordered
    .slice(0, MAX_CARDS_PER_LESSON)
    .map((card, index) => ({ ...card, sortOrder: index }));
}

/**
 * One lesson in, up to four gated cards out.
 *
 * The cloze card is built first and costs nothing, so it exists whether or not the model call
 * succeeds — but a model failure still propagates, because D45's refusal is about the DECK, not
 * about one card. Returning a cloze-only deck on a failed call is exactly the recognition-only
 * outcome the ruling forbids.
 */
export async function generateCardsForLesson(
  gateway: GatewayDeps,
  input: {
    userId: string;
    budgetCeilingUsd: number;
    lesson: LessonForCards;
    /** Null under D41. Every topicality verdict is then `unknown`, and counted as such. */
    embeddings: EmbeddingsProvider | null;
    counters: InvariantCounters;
  },
): Promise<CardGenerationOutcome> {
  const userContent = buildUserContent(input.lesson);

  const result = await callLlm(gateway, {
    userId: input.userId,
    callType: "lesson_card_generation",
    model: CARD_MODEL,
    systemPrompt: CARD_SYSTEM_PROMPT,
    userContent,
    toolName: "emit_lesson_cards",
    toolInputSchema: CARD_GENERATION_TOOL_SCHEMA,
    maxTokens: CARD_MAX_TOKENS,
    budgetCeilingUsd: input.budgetCeilingUsd,
    schema: CardGenerationResultSchema,
    estimatedInputTokens: Math.ceil((userContent.length + CARD_SYSTEM_PROMPT.length) / 4),
  });

  if (result.kind === "budgetExceeded") return { kind: "budgetExceeded" };
  if (result.kind === "deterministicFallback") return { kind: "failed", reason: result.reason };

  const candidates: CardCandidate[] = [];

  // First answer per type wins; a repeat is noise, the same rule triage applies to a repeated
  // chunk verdict. The model cannot emit a cloze card at all — the Zod enum refuses one.
  const seenTypes = new Set<string>();
  for (const card of result.data.cards) {
    if (seenTypes.has(card.promptType)) continue;
    seenTypes.add(card.promptType);
    candidates.push({ promptType: card.promptType, prompt: card.prompt.trim(), answer: card.answer.trim() });
  }

  const cloze = buildClozeCard(input.lesson.coreClaim);
  if (cloze.ok) candidates.push({ promptType: "cloze", prompt: cloze.prompt, answer: cloze.answer });

  // Embeddings for the topicality gate: the claim ONCE, plus every candidate prompt, in a single
  // batch and with a single input type. The claim is embedded here rather than reusing
  // `lessons.embedding` on purpose — that stored vector is of `title + coreClaim`, and
  // TOPICALITY_FLOOR was calibrated against prompt-versus-CLAIM pairs. Comparing against a
  // different text than the threshold was measured on is how a calibrated number quietly stops
  // meaning what its comment says.
  let claimVector: number[] | null = null;
  let promptVectors: Array<number[] | null> = candidates.map(() => null);

  if (input.embeddings != null && candidates.length > 0) {
    const embedded = await embedTexts(
      input.embeddings,
      [input.lesson.coreClaim, ...candidates.map((c) => c.prompt)],
      "document",
    );
    if (embedded.kind === "ok") {
      claimVector = embedded.vectors[0] ?? null;
      promptVectors = candidates.map((_, index) => embedded.vectors[index + 1] ?? null);
    }
    // A provider failure here is deliberately NOT a retry and NOT a card drop: it lands in the
    // same place an absent key does — `unknown` — which is the honest verdict either way. The
    // cards are still gated by anti-leak and the sanity checks, which need no vectors.
  }

  const { kept, dropped } = applyGates(
    input.lesson.id,
    candidates,
    { claim: claimVector, prompts: promptVectors },
    input.counters,
  );

  return {
    kind: "ok",
    cards: composeDeck(kept),
    dropped,
    costUsd: result.costUsd,
    topicalityChecked: claimVector != null,
  };
}
