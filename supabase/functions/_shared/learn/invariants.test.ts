import { assertEquals } from "jsr:@std/assert@1";
import {
  ANTI_LEAK_JACCARD_CEILING,
  CLAIM_QUOTE_JACCARD_CEILING,
  cosineSimilarity,
  newInvariantCounters,
  passesAntiLeak,
  passesCardTextSanity,
  passesClaimNotQuote,
  passesClaimProvenanceRelevance,
  passesLanguageSanity,
  passesMechanismRelevance,
  passesTitleClaimRelevance,
  passesTopicality,
} from "./invariants.ts";
import type { CandidateLesson } from "./types.ts";

function candidate(over: Partial<CandidateLesson> = {}): CandidateLesson {
  return {
    title: "Start with two minutes",
    coreClaim: "Shrinking a task to two minutes removes the friction that stops you beginning it.",
    mechanism: "Starting is the expensive part; once begun, continuing costs far less.",
    claimToTask: "Pick tomorrow's hardest task and define a two-minute version of it.",
    evidenceStrength: "author_anecdote",
    provenanceQuote: "When a habit feels too large, scale it down until it takes two minutes.",
    ...over,
  };
}

// The standing lesson behind ADR-011: an invariant that can pass for a degenerate reason is not an
// invariant. Several tests below are written specifically to ask what the CHEAPEST way is for
// output to satisfy a gate while still being wrong.

Deno.test("anti-leak drops a card whose prompt hands over the answer", () => {
  // A real leak restates the answer as a question. Written after a first attempt measured 0.23 --
  // under the ceiling -- because merely mentioning the topic is not leaking it. The gate was right
  // and the test was wrong, which is ADR-011's standing lesson arriving from the other direction.
  const leaky = passesAntiLeak(
    "How does shrinking a task to two minutes remove the friction that stops you beginning it?",
    "Shrinking a task to two minutes removes the friction that stops you beginning it.",
  );
  assertEquals(leaky.passed, false);
  assertEquals(leaky.overlap > ANTI_LEAK_JACCARD_CEILING, true);
});

Deno.test("anti-leak passes a prompt that names the topic without answering it", () => {
  const clean = passesAntiLeak(
    "You have been putting off a report for a week. What would this lesson have you do first?",
    "Shrinking a task to two minutes removes the friction that stops you beginning it.",
  );
  assertEquals(clean.passed, true);
  assertEquals(clean.overlap < ANTI_LEAK_JACCARD_CEILING, true);
});

Deno.test("anti-leak ALONE would accept an unanswerable prompt -- which is why topicality exists", () => {
  // The degenerate pass. This prompt leaks nothing and is worthless, and a session interleaved
  // across sources shows it cold. The band is the invariant, not either half.
  const vague = passesAntiLeak(
    "What is the main idea of the lesson?",
    "Shrinking a task to two minutes removes the friction that stops you beginning it.",
  );
  assertEquals(vague.passed, true);
  // Topicality is the half that catches it -- with embeddings that disagree, it fails.
  const failed = passesTopicality([1, 0, 0], [0, 1, 0]);
  assertEquals(failed.verdict, "fail");
});

Deno.test("claim-not-quote drops a verbatim copy", () => {
  const quote = "When a habit feels too large, scale it down until it takes two minutes.";
  assertEquals(passesClaimNotQuote(candidate({ coreClaim: quote, provenanceQuote: quote })), false);
});

Deno.test("claim-not-quote drops a near-copy the substring check misses", () => {
  // Two sentences from the quote merged into one clause: not a substring match, but exactly the
  // "quote with words swapped" that transformation is supposed to prevent.
  assertEquals(
    passesClaimNotQuote(
      candidate({
        coreClaim: "When a habit feels too large, scaling it down until it takes two minutes works.",
        provenanceQuote: "When a habit feels too large, scale it down until it takes two minutes.",
      }),
    ),
    false,
  );
});

Deno.test("claim-not-quote passes a genuine transformation", () => {
  assertEquals(passesClaimNotQuote(candidate()), true);
  assertEquals(CLAIM_QUOTE_JACCARD_CEILING, 0.5);
});

Deno.test("claim-not-quote rejects an empty claim rather than passing it trivially", () => {
  assertEquals(passesClaimNotQuote(candidate({ coreClaim: "   " })), false);
});

Deno.test("language sanity catches a mid-sentence code-switch", () => {
  assertEquals(passesLanguageSanity("Start with two minutes."), true);
  assertEquals(passesLanguageSanity("Start with two minutes 因为 it removes friction."), false);
});

Deno.test("card-text sanity rejects leaked scaffolding, truncation and cloze artifacts", () => {
  assertEquals(passesCardTextSanity("How would you use self-control as outlined in application answer:"), false);
  assertEquals(passesCardTextSanity("What does this lesson say about conclusions / detrimental?"), false);
  assertEquals(passesCardTextSanity("Why does starting matter"), false); // question, no mark
  assertEquals(passesCardTextSanity("The rule is"), false); // no terminal punctuation
  assertEquals(passesCardTextSanity("   "), false);
});

Deno.test("card-text sanity accepts finished prose, including a legitimate slash idiom", () => {
  assertEquals(passesCardTextSanity("What would this lesson have you do first?"), true);
  assertEquals(passesCardTextSanity("Decide whether the task is worth doing and/or delegating."), true);
});

Deno.test("a semantic gate reports UNKNOWN without embeddings -- never a pass", () => {
  // D41: the embeddings key may be absent. A gate that silently passes when it cannot run reports
  // a guarantee it did not check, which is worse than having no gate.
  assertEquals(passesClaimProvenanceRelevance(null, [1, 0]).verdict, "unknown");
  assertEquals(passesMechanismRelevance([1, 0], null).verdict, "unknown");
  assertEquals(passesTitleClaimRelevance(null, null).verdict, "unknown");
  assertEquals(passesTopicality(null, [1, 0]).verdict, "unknown");
});

Deno.test("claim-provenance relevance separates the calibrated severe case from a good one", () => {
  // Orthogonal vectors stand in for the 0.180 outlier; near-parallel for a legitimate paraphrase.
  assertEquals(passesClaimProvenanceRelevance([1, 0, 0], [0, 0, 1]).verdict, "fail");
  assertEquals(passesClaimProvenanceRelevance([1, 0.9, 0], [0.9, 1, 0]).verdict, "pass");
});

Deno.test("cosineSimilarity is 0 for a zero vector rather than NaN", () => {
  // A zero vector is what an embedding provider returns on a degenerate input; NaN would propagate
  // silently through every comparison and make each gate pass.
  assertEquals(cosineSimilarity([0, 0], [1, 1]), 0);
  assertEquals(cosineSimilarity([], []), 0);
});

Deno.test("counters start at zero and carry an unknown bucket for every semantic gate", () => {
  const counters = newInvariantCounters();
  assertEquals(Object.values(counters).every((v) => v === 0), true);
  // "we could not check" must never hide inside "passed".
  assertEquals(typeof counters.claimProvenanceUnknown, "number");
  assertEquals(typeof counters.mechanismUnknown, "number");
  assertEquals(typeof counters.titleClaimUnknown, "number");
  assertEquals(typeof counters.topicalityUnknown, "number");
});
