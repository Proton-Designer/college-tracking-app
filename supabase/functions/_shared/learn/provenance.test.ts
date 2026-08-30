import { assertEquals } from "jsr:@std/assert@1";
import { normalizeForQuoteMatch, QUOTE_LIMITS, verifyQuoteInChunk } from "./provenance.ts";

const CHUNK = [
  "Habits are the compound interest of self-improvement. The same way that money",
  "multiplies through compound interest, the effects of your habits multiply as you",
  "repeat them. They seem to make little difference on any given day and yet the impact",
  "they deliver over the months and years can be enormous.",
].join(" ");

Deno.test("verifyQuoteInChunk: a genuine quote passes and returns the CHUNK's own substring", () => {
  const result = verifyQuoteInChunk("the effects of your habits multiply as you repeat them", CHUNK);

  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.quote, "the effects of your habits multiply as you repeat them");
    assertEquals(CHUNK.includes(result.quote), true, "what is stored must be text taken out of the source");
  }
});

Deno.test("verifyQuoteInChunk: a fabricated quote is DROPPED — the model's word is never taken", () => {
  // Fluent, plausible, on-topic, and nowhere in the chunk. This is the failure the
  // NOT NULL constraint cannot catch, and the whole reason this module exists.
  const result = verifyQuoteInChunk(
    "Every habit you keep is a vote cast for the person you are quietly becoming.",
    CHUNK,
  );

  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "not_found");
});

Deno.test("verifyQuoteInChunk: a quote that merely PARAPHRASES the chunk is dropped", () => {
  // Same claim, different words. A citation that does not appear in the text is not a
  // citation, however true it is.
  const result = verifyQuoteInChunk("Small habits accumulate into large outcomes over months and years", CHUNK);
  assertEquals(result.ok, false);
});

Deno.test("verifyQuoteInChunk: PDF-layer typography does not reject an honest quote", () => {
  // The text layer emits curly quotes, an en-dash and a non-breaking space; the model
  // retypes them plainly. Rejecting this would be a gate firing on honest work, which is
  // how gates get weakened by the next maintainer.
  const messyChunk =
    "The author writes: “you do not rise to the level of your goals—you fall to the level of your systems.”";
  const result = verifyQuoteInChunk('you do not rise to the level of your goals - you fall to the level of your systems.', messyChunk);

  assertEquals(result.ok, true);
  if (result.ok) {
    // Stored text keeps the SOURCE's typography, not the model's.
    assertEquals(result.quote.includes("—"), true);
  }
});

Deno.test("verifyQuoteInChunk: re-capitalising a mid-sentence fragment still matches, and stores the source casing", () => {
  const result = verifyQuoteInChunk("They Seem To Make Little Difference On Any Given Day", CHUNK);
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.quote, "They seem to make little difference on any given day");
});

Deno.test("verifyQuoteInChunk: line-broken source text still matches a cleanly retyped quote", () => {
  const broken = "the effects of your\n   habits    multiply\nas you repeat them";
  const result = verifyQuoteInChunk("the effects of your habits multiply as you repeat them", broken);
  assertEquals(result.ok, true);
});

Deno.test("verifyQuoteInChunk: a too-short fragment is refused even though it IS in the chunk", () => {
  // "compound interest" really is present — and grounds nothing. A gate that accepts
  // three words is not a gate.
  const result = verifyQuoteInChunk("compound interest", CHUNK);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "too_short");
  assertEquals("compound interest".length < QUOTE_LIMITS.MIN_QUOTE_CHARS, true);
});

Deno.test("verifyQuoteInChunk: pasting the entire chunk back as a 'quote' is refused", () => {
  const huge = "x".repeat(QUOTE_LIMITS.MAX_QUOTE_CHARS + 1);
  const result = verifyQuoteInChunk(huge, huge);
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.reason, "too_long");
});

Deno.test("verifyQuoteInChunk: an empty or whitespace quote is refused before any search", () => {
  assertEquals(verifyQuoteInChunk("", CHUNK), { ok: false, reason: "empty" });
  assertEquals(verifyQuoteInChunk("   \n ", CHUNK), { ok: false, reason: "empty" });
  assertEquals(verifyQuoteInChunk('"..."', CHUNK), { ok: false, reason: "empty" });
});

Deno.test("verifyQuoteInChunk: surrounding quotation marks and ellipses are stripped, not matched literally", () => {
  const result = verifyQuoteInChunk('"...the effects of your habits multiply as you repeat them..."', CHUNK);
  assertEquals(result.ok, true);
  if (result.ok) assertEquals(result.quote.startsWith("the effects"), true);
});

Deno.test("verifyQuoteInChunk: a quote spanning the whole chunk boundary cannot borrow from another chunk", () => {
  // The gate is per-chunk by construction: text from the NEXT chunk is simply not
  // present in this haystack.
  const other = "An entirely different page about spaced repetition and retrieval practice.";
  assertEquals(verifyQuoteInChunk("An entirely different page about spaced repetition", CHUNK).ok, false);
  assertEquals(verifyQuoteInChunk("An entirely different page about spaced repetition", other).ok, true);
});

Deno.test("normalizeForQuoteMatch: collapses whitespace, folds typography, lowercases", () => {
  assertEquals(normalizeForQuoteMatch("  A—B  \n C’s  "), "a-b c's");
});
