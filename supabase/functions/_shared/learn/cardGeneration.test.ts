import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  buildClozeCard,
  generateCardsForLesson,
  CLOZE_BLANK,
  type LessonForCards,
} from "./cardGeneration.ts";
import { newInvariantCounters } from "./invariants.ts";
import { createFixtureProvider, type FixtureResponse } from "../llm/__fixtures__/fixtureProvider.ts";
import { createDeterministicEmbeddingsProvider } from "../embeddings/__fixtures__/fixtureEmbeddingsProvider.ts";
import type { GatewayDeps } from "../llm/gateway.ts";
import type { UsageLogEntry } from "../llm/types.ts";

// ============================================================================
// The deterministic half — cloze. No gateway, no key, no network, no cost.
// ============================================================================

Deno.test("buildClozeCard: blanks one meaningful term out of the claim and answers with it", () => {
  const result = buildClozeCard("Reduce the starting friction until refusing takes more effort than beginning.");

  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertStringIncludes(result.prompt, CLOZE_BLANK);
  // The blank replaced the term and nothing else: putting the answer back reconstructs the claim.
  assertEquals(
    result.prompt.replace(CLOZE_BLANK, result.answer),
    "Reduce the starting friction until refusing takes more effort than beginning.",
  );
  assertEquals(result.prompt.includes(result.answer), false, "the answer must not also sit in the prompt");
});

Deno.test("buildClozeCard: a STOPWORD is never blanked, even when it is the longest candidate", () => {
  // "because" (7) is longer than every content word here — it would win the length tie-break
  // outright if the stopword filter were a preference rather than a filter on the candidate pool.
  const result = buildClozeCard("Habits stick because tiny wins repeat.");

  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.answer, "stick");
  assertEquals(result.prompt, `Habits ${CLOZE_BLANK} because tiny wins repeat.`);
});

Deno.test("buildClozeCard: never the FIRST or LAST word, even when they are the longest words in the claim", () => {
  // "Consistency" (11) and "intensity" (9) are both longer than "beats" (5). Only "beats" is in
  // the pool at all, because the other two are the sentence's first and last words.
  const result = buildClozeCard("Consistency beats intensity.");

  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.answer, "beats");
  // The last word keeps the claim's terminal punctuation, which passesCardTextSanity requires.
  assertEquals(result.prompt.endsWith("intensity."), true);
});

Deno.test("buildClozeCard: a term that appears TWICE is never blanked — its twin would be the answer key", () => {
  // "Repetition" (10) is the longest candidate by length and would win, except that blanking one
  // occurrence leaves the other sitting in the prompt beside the blank.
  const result = buildClozeCard("Repetition builds repetition into an automatic routine.");

  assertEquals(result.ok, true);
  if (!result.ok) return;
  assertEquals(result.answer, "automatic");
  assertEquals(result.prompt.toLowerCase().includes("automatic"), false);
});

Deno.test("buildClozeCard: no eligible term produces NO card rather than a weak one", () => {
  // Every interior word is a short stopword. The honest answer is that this claim has no cloze
  // card in it — not a blank over "it".
  const result = buildClozeCard("Do it now.");
  assertEquals(result.ok, false);
  if (result.ok) return;
  assertEquals(result.reason, "no_eligible_term");
});

Deno.test("buildClozeCard: a term shorter than the minimum is not blanked", () => {
  // "up" and "now" are interior non-stopwords, and both are under the four-character floor.
  assertEquals(buildClozeCard("Get up now.").ok, false);
});

// ============================================================================
// The model half — the gates, the band, and the refusal
// ============================================================================

const LESSON: LessonForCards = {
  id: 7,
  title: "Rehearse the idea instead of rereading it",
  coreClaim: "Deliberate rehearsal beats passive review because retrieval strengthens memory.",
  mechanism: "Retrieval is itself a learning event; rereading is recognition wearing a costume.",
  claimToTask: "Close the book and write down what you remember before you reread anything.",
  provenanceQuote: "the act of retrieving a memory changes the memory, making it easier to retrieve next time",
};

function makeGateway(responses: FixtureResponse[], logged: UsageLogEntry[] = []): GatewayDeps {
  return {
    provider: createFixtureProvider(responses),
    getMonthlySpendUsd: () => Promise.resolve(0),
    logUsage: (entry) => {
      logged.push(entry);
      return Promise.resolve();
    },
    now: () => new Date("2026-08-30T00:00:00Z"),
  };
}

/** Inside the band: each prompt reuses the claim's topic words and shares no content word with
 *  its own answer. */
const GOOD_CARDS = {
  cards: [
    {
      promptType: "free_recall",
      prompt: "In a study session, does deliberate rehearsal or passive review do more for memory?",
      answer: "Pulling the idea back out of your head builds a stronger trace than seeing it again on the page.",
    },
    {
      promptType: "application",
      prompt: "Twenty minutes, one chapter, passive review or deliberate rehearsal?",
      answer: "Spend the block writing down what you remember, then check the page for what you missed.",
    },
    {
      promptType: "why",
      prompt: "Why does deliberate rehearsal beat passive review for memory?",
      answer: "Every act of pulling something back from your head is itself a learning event; looking at the page is not.",
    },
  ],
};

Deno.test("generateCardsForLesson: a typical lesson gets FOUR cards — three written, one derived", async () => {
  const counters = newInvariantCounters();
  const outcome = await generateCardsForLesson(makeGateway([{ kind: "success", toolInput: GOOD_CARDS }]), {
    userId: "user-1",
    budgetCeilingUsd: 20,
    lesson: LESSON,
    embeddings: createDeterministicEmbeddingsProvider(),
    counters,
  });

  assertEquals(outcome.kind, "ok");
  if (outcome.kind !== "ok") return;

  assertEquals(outcome.cards.length, 4);
  assertEquals(outcome.cards.map((c) => c.promptType), ["free_recall", "cloze", "application", "why"]);
  assertEquals(outcome.cards.map((c) => c.sortOrder), [0, 1, 2, 3]);
  assertEquals(outcome.dropped.length, 0);
  assertEquals(outcome.topicalityChecked, true);

  // The cloze card is the deterministic one, and it was never asked of the model.
  const cloze = outcome.cards.find((c) => c.promptType === "cloze")!;
  assertStringIncludes(cloze.prompt, CLOZE_BLANK);
  assertEquals(cloze.answer, "strengthens");
});

Deno.test("generateCardsForLesson: the deck always contains a free_recall card AND a non-recall card", async () => {
  const outcome = await generateCardsForLesson(makeGateway([{ kind: "success", toolInput: GOOD_CARDS }]), {
    userId: "user-1",
    budgetCeilingUsd: 20,
    lesson: LESSON,
    embeddings: null,
    counters: newInvariantCounters(),
  });

  assertEquals(outcome.kind, "ok");
  if (outcome.kind !== "ok") return;
  assertEquals(outcome.cards.some((c) => c.promptType === "free_recall"), true);
  assertEquals(outcome.cards.some((c) => c.promptType !== "free_recall"), true);
  assertEquals(outcome.cards.length >= 2 && outcome.cards.length <= 4, true);
});

Deno.test("generateCardsForLesson: a card that hands over its answer is DROPPED", async () => {
  const counters = newInvariantCounters();
  const leaking = {
    cards: [
      {
        promptType: "free_recall",
        // The claim, with a question mark on it. Answering requires reading, not remembering.
        prompt: "Does deliberate rehearsal beat passive review because retrieval strengthens memory?",
        answer: "Deliberate rehearsal beats passive review because retrieval strengthens memory.",
      },
      GOOD_CARDS.cards[1]!,
      GOOD_CARDS.cards[2]!,
    ],
  };

  const outcome = await generateCardsForLesson(makeGateway([{ kind: "success", toolInput: leaking }]), {
    userId: "user-1",
    budgetCeilingUsd: 20,
    lesson: LESSON,
    embeddings: createDeterministicEmbeddingsProvider(),
    counters,
  });

  assertEquals(outcome.kind, "ok");
  if (outcome.kind !== "ok") return;
  assertEquals(counters.antiLeakDropped, 1);
  assertEquals(outcome.dropped[0]?.reason, "anti_leak");
  // And with no free_recall card left standing, the whole deck is withheld rather than shipped
  // as a recognise-and-transfer set.
  assertEquals(outcome.cards.length, 0);
});

Deno.test("generateCardsForLesson: THE BAND — a prompt that leaks nothing and is unanswerable also fails", async () => {
  // This is the over-correction anti-leak invites. "What is the main idea of the lesson?" scores
  // essentially zero overlap with any answer, so anti-leak passes it trivially. Topicality is what
  // catches it, and the two are checked independently for exactly this case.
  const counters = newInvariantCounters();
  const vague = {
    cards: [
      {
        promptType: "free_recall",
        prompt: "What is the main idea of the lesson?",
        answer: "Pulling the idea back out of your head builds a stronger trace than seeing it again on the page.",
      },
      GOOD_CARDS.cards[1]!,
      GOOD_CARDS.cards[2]!,
    ],
  };

  const outcome = await generateCardsForLesson(makeGateway([{ kind: "success", toolInput: vague }]), {
    userId: "user-1",
    budgetCeilingUsd: 20,
    lesson: LESSON,
    embeddings: createDeterministicEmbeddingsProvider(),
    counters,
  });

  assertEquals(outcome.kind, "ok");
  if (outcome.kind !== "ok") return;
  assertEquals(counters.antiLeakDropped, 0, "anti-leak passes it — which is the whole problem");
  assertEquals(counters.topicalityFailedDropped, 1);
  assertEquals(outcome.dropped[0]?.reason, "topicality");
  assertEquals(outcome.cards.length, 0, "no free_recall survivor means no deck");
});

Deno.test("generateCardsForLesson: with NO embeddings, topicality is UNKNOWN — counted, never a pass", async () => {
  const counters = newInvariantCounters();
  const outcome = await generateCardsForLesson(makeGateway([{ kind: "success", toolInput: GOOD_CARDS }]), {
    userId: "user-1",
    budgetCeilingUsd: 20,
    lesson: LESSON,
    embeddings: null,
    counters,
  });

  assertEquals(outcome.kind, "ok");
  if (outcome.kind !== "ok") return;
  assertEquals(outcome.topicalityChecked, false, "the record must say the gate did not run");
  assertEquals(counters.topicalityUnknown, 4, "every card is counted as unchecked");
  assertEquals(counters.topicalityFailedDropped, 0, "unknown is not a failure either");
  assertEquals(outcome.cards.length, 4);
});

Deno.test("generateCardsForLesson: without embeddings the vague prompt is UNCHECKED, not silently passed", async () => {
  // The honest consequence of D41, stated as a test so nobody later reads the keyless run's clean
  // drop counts as evidence the cards were verified. The same unanswerable prompt that topicality
  // rejects above survives here — and the counter is what says so.
  const counters = newInvariantCounters();
  const vague = {
    cards: [
      {
        promptType: "free_recall",
        prompt: "What is the main idea of the lesson?",
        answer: "Pulling the idea back out of your head builds a stronger trace than seeing it again on the page.",
      },
      GOOD_CARDS.cards[1]!,
      GOOD_CARDS.cards[2]!,
    ],
  };

  const outcome = await generateCardsForLesson(makeGateway([{ kind: "success", toolInput: vague }]), {
    userId: "user-1",
    budgetCeilingUsd: 20,
    lesson: LESSON,
    embeddings: null,
    counters,
  });

  assertEquals(outcome.kind, "ok");
  if (outcome.kind !== "ok") return;
  assertEquals(counters.topicalityFailedDropped, 0);
  assertEquals(counters.topicalityUnknown, 4);
  assertEquals(outcome.topicalityChecked, false);
});

Deno.test("generateCardsForLesson: a card whose prompt trails off mid-clause is dropped by text sanity", async () => {
  const counters = newInvariantCounters();
  const broken = {
    cards: [
      {
        promptType: "free_recall",
        // Leaked scaffolding with a bare trailing colon — the exact shape that reached a real
        // database in the source project.
        prompt: "How would you use deliberate rehearsal as outlined in application answer:",
        answer: "Pulling the idea back out of your head builds a stronger trace than seeing it again on the page.",
      },
      GOOD_CARDS.cards[1]!,
      GOOD_CARDS.cards[2]!,
    ],
  };

  const outcome = await generateCardsForLesson(makeGateway([{ kind: "success", toolInput: broken }]), {
    userId: "user-1",
    budgetCeilingUsd: 20,
    lesson: LESSON,
    embeddings: null,
    counters,
  });

  assertEquals(outcome.kind, "ok");
  if (outcome.kind !== "ok") return;
  assertEquals(counters.cardTextSanityDropped, 1);
  assertEquals(outcome.dropped[0]?.reason, "text_sanity");
});

Deno.test("generateCardsForLesson: a model that emits a CLOZE card is refused by the schema", async () => {
  // D45's split, enforced by the contract rather than by a comment: cloze is deterministic, so
  // there is no state of the world in which a model-written one is correct. Zod rejects it, the
  // gateway retries once, and the second rejection is a failure the step handles.
  const outcome = await generateCardsForLesson(
    makeGateway([{
      kind: "success",
      toolInput: { cards: [{ promptType: "cloze", prompt: "Deliberate _____ beats passive review.", answer: "rehearsal" }] },
    }]),
    { userId: "user-1", budgetCeilingUsd: 20, lesson: LESSON, embeddings: null, counters: newInvariantCounters() },
  );

  assertEquals(outcome.kind, "failed");
  if (outcome.kind !== "failed") return;
  assertStringIncludes(outcome.reason, "schema_validation_failed");
});

Deno.test("generateCardsForLesson: the budget ceiling refuses before any call is made", async () => {
  const provider = createFixtureProvider([{ kind: "success", toolInput: GOOD_CARDS }]);
  const outcome = await generateCardsForLesson(
    {
      provider,
      getMonthlySpendUsd: () => Promise.resolve(999),
      logUsage: () => Promise.resolve(),
      now: () => new Date("2026-08-30T00:00:00Z"),
    },
    { userId: "user-1", budgetCeilingUsd: 20, lesson: LESSON, embeddings: null, counters: newInvariantCounters() },
  );

  assertEquals(outcome.kind, "budgetExceeded");
  assertEquals(provider.callCount(), 0, "no paid call is made once the ceiling would be crossed");
});

Deno.test("generateCardsForLesson: spend is billed under its OWN call type, not extraction's", async () => {
  const logged: UsageLogEntry[] = [];
  await generateCardsForLesson(makeGateway([{ kind: "success", toolInput: GOOD_CARDS }], logged), {
    userId: "user-1",
    budgetCeilingUsd: 20,
    lesson: LESSON,
    embeddings: null,
    counters: newInvariantCounters(),
  });

  assertEquals(logged.length, 1);
  assertEquals(logged[0]!.callType, "lesson_card_generation");
  assertEquals(logged[0]!.provider, "anthropic");
});

Deno.test("generateCardsForLesson: the model never sees a chunk — only the grounded lesson", async () => {
  const provider = createFixtureProvider([{ kind: "success", toolInput: GOOD_CARDS }]);
  await generateCardsForLesson(
    {
      provider,
      getMonthlySpendUsd: () => Promise.resolve(0),
      logUsage: () => Promise.resolve(),
      now: () => new Date("2026-08-30T00:00:00Z"),
    },
    { userId: "user-1", budgetCeilingUsd: 20, lesson: LESSON, embeddings: null, counters: newInvariantCounters() },
  );

  const sent = JSON.parse(provider.requests()[0]!.userContent) as Record<string, unknown>;
  assertEquals(sent.coreClaim, LESSON.coreClaim);
  assertEquals(sent.groundingPassage, LESSON.provenanceQuote);
  // There is no channel for ungrounded content to enter: card generation works from a lesson that
  // already passed the provenance gate, never from source text it could quote freshly.
  assertEquals(Object.keys(sent).sort(), ["coreClaim", "groundingPassage", "mechanism", "suggestedAction", "title"]);
});
