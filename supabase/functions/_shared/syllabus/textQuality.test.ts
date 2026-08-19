import { assertEquals } from "jsr:@std/assert@1";
import { assessExtractedText } from "./textQuality.ts";

Deno.test("assessExtractedText: accepts normal syllabus-like prose", () => {
  const text = "BIOL 23000 Syllabus. ".repeat(20) + "Exams are worth 60% of the grade and homework 40%.";
  const result = assessExtractedText(text);
  assertEquals(result.ok, true);
});

Deno.test("assessExtractedText: rejects near-empty text (a scanned PDF with no text layer)", () => {
  const result = assessExtractedText("   \n\n  ");
  assertEquals(result.ok, false);
  assertEquals(result.wordCount, 0);
});

Deno.test("assessExtractedText: rejects short text below the word-count floor", () => {
  const result = assessExtractedText("Course syllabus page one.");
  assertEquals(result.ok, false);
});

Deno.test("assessExtractedText: rejects text that is mostly non-printable garble", () => {
  const garble = "���� ".repeat(60);
  const result = assessExtractedText(garble);
  assertEquals(result.ok, false);
  assertEquals(result.printableRatio < 0.85, true);
});

Deno.test("assessExtractedText: tolerates accented names and curly punctuation", () => {
  const text =
    "Professor José García's office hours are Tuesdays 2–4pm. ".repeat(10) +
    "Grading: exams 60%, homework 40%.";
  const result = assessExtractedText(text);
  assertEquals(result.ok, true);
});
