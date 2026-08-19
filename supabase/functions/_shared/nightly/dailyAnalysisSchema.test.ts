// Golden-fixture tests for the LLM_LAYER_SPEC.md §2 lens rules -- there is no
// ANTHROPIC_API_KEY in any environment this has been built against (same constraint as
// L5/L7 elsewhere), so this is validated against hand-built fixtures standing in for a
// real model response, never a live model call.

import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { DailyAnalysisSchema, LensesSchema, LENS_NAMES } from "./dailyAnalysisSchema.ts";

const VALID_LENSES = {
  executive_coach: "Deep work landed but MITs slipped -- protect tomorrow's first block.",
  academic_strategist: "Midterm 2 is 7 days out with low confidence -- close the gap this week.",
  behavior_analyst: "The kill habit held tonight, tracking with the earlier bedtime two days running.",
  skeptic: "The 95 actual deep-work minutes came from one session -- one data point isn't a pattern yet.",
  systems_engineer: "Move the deep-work block earlier rather than asking for more willpower at a slot that's already failed twice.",
  motivator: "Resisting the kill habit tonight after two straight misses is the real turnaround.",
  recovery_coach: "",
};

function validAnalysis(overrides: Record<string, unknown> = {}) {
  return {
    headline: "Solid focus, weak start.",
    objective_summary: "2 of 3 MITs completed, 95 of 120 planned deep-work minutes.",
    wins: [],
    failures: [],
    planning_errors: [],
    behavior_patterns: [],
    academic_risks: [],
    lenses: VALID_LENSES,
    tomorrow_changes: [],
    kill_list_intervention: null,
    data_gaps: [],
    ...overrides,
  };
}

Deno.test("LENS_NAMES: exactly the seven lenses from LLM_LAYER_SPEC.md §2", () => {
  assertEquals([...LENS_NAMES].sort(), [
    "academic_strategist",
    "behavior_analyst",
    "executive_coach",
    "motivator",
    "recovery_coach",
    "skeptic",
    "systems_engineer",
  ]);
});

Deno.test("DailyAnalysisSchema: accepts a full, real-shaped response including all seven lenses", () => {
  const parsed = DailyAnalysisSchema.safeParse(validAnalysis());
  assert(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues));
});

Deno.test("DailyAnalysisSchema: rejects a response missing the lenses field entirely", () => {
  const { lenses: _drop, ...withoutLenses } = validAnalysis();
  const parsed = DailyAnalysisSchema.safeParse(withoutLenses);
  assertFalse(parsed.success);
});

Deno.test("LensesSchema: rejects an empty skeptic lens -- §2's explicit non-empty rule", () => {
  const parsed = LensesSchema.safeParse({ ...VALID_LENSES, skeptic: "" });
  assertFalse(parsed.success);
});

Deno.test("LensesSchema: accepts recovery_coach as an empty string (the not-in-Recovery-Mode case)", () => {
  const parsed = LensesSchema.safeParse({ ...VALID_LENSES, recovery_coach: "" });
  assert(parsed.success);
});

Deno.test("LensesSchema: accepts recovery_coach populated (the in-Recovery-Mode case)", () => {
  const parsed = LensesSchema.safeParse({
    ...VALID_LENSES,
    recovery_coach: "Four signals fired tonight, three of them execution/academic, not just physiological -- ease tomorrow's plan back toward the MVD.",
  });
  assert(parsed.success);
});

Deno.test("LensesSchema: rejects a motivator lens over the short-cap backstop", () => {
  const parsed = LensesSchema.safeParse({ ...VALID_LENSES, motivator: "x".repeat(321) });
  assertFalse(parsed.success);
});

Deno.test("LensesSchema: rejects an empty executive_coach lens -- every always-on lens is required, not just skeptic", () => {
  const parsed = LensesSchema.safeParse({ ...VALID_LENSES, executive_coach: "" });
  assertFalse(parsed.success);
});

Deno.test("LensesSchema: rejects an unknown extra lens key being required instead of a real one", () => {
  const { skeptic: _drop, ...withoutSkeptic } = VALID_LENSES;
  const parsed = LensesSchema.safeParse(withoutSkeptic);
  assertFalse(parsed.success);
});
