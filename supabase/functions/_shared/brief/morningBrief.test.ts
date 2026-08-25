import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { buildDeterministicBrief, generateMorningBrief, type MorningBriefFacts } from "./morningBrief.ts";
import { createFixtureProvider } from "../llm/__fixtures__/fixtureProvider.ts";
import type { GatewayDeps } from "../llm/gateway.ts";

const FULL: MorningBriefFacts = {
  localDate: "2026-08-25",
  sleepHours: 7.6,
  recoveryPct: 62,
  mits: ["ECON outline", "MATH PSet 4"],
  dueSoon: ["MATH 1308 · Unit Exam 1 · due 2026-09-16"],
  announcementsApplied: 1,
};

Deno.test("deterministic brief: at most three lines, all facts, no invention", () => {
  const brief = buildDeterministicBrief(FULL);
  const lines = brief.split("\n");
  assertEquals(lines.length <= 3, true);
  assertStringIncludes(brief, "7.6h");
  assertStringIncludes(brief, "62%");
  assertStringIncludes(brief, "ECON outline");
  assertStringIncludes(brief, "1 announcement applied");
});

Deno.test("deterministic brief: absent signals produce silence, not 'unknown'", () => {
  const brief = buildDeterministicBrief({ ...FULL, sleepHours: null, recoveryPct: null, announcementsApplied: 0 });
  assertEquals(brief.toLowerCase().includes("unknown"), false);
  assertEquals(brief.toLowerCase().includes("sleep"), false);
});

Deno.test("deterministic brief: no plan points at the Night Plan without a lecture", () => {
  const brief = buildDeterministicBrief({ ...FULL, mits: [] });
  assertStringIncludes(brief, "Night Plan");
});

Deno.test("generateMorningBrief: model output used when the gateway returns ok", async () => {
  const deps: GatewayDeps = {
    provider: createFixtureProvider([
      { kind: "success", toolInput: { lines: ["Slept 7.6h, recovery 62%.", "MIT: ECON outline.", "Exam in 22 days."] } },
    ]),
    getMonthlySpendUsd: () => Promise.resolve(0),
    logUsage: () => Promise.resolve(),
    now: () => new Date("2026-08-25T12:00:00Z"),
  };
  const result = await generateMorningBrief(deps, { userId: "u", budgetCeilingUsd: 5, facts: FULL });
  assertEquals(result.source, "model");
  assertEquals(result.brief.split("\n").length, 3);
});

Deno.test("generateMorningBrief: budget exceeded degrades to the deterministic brief, silently and honestly", async () => {
  const provider = createFixtureProvider([{ kind: "success", toolInput: { lines: ["x"] } }]);
  const deps: GatewayDeps = {
    provider,
    getMonthlySpendUsd: () => Promise.resolve(999),
    logUsage: () => Promise.resolve(),
    now: () => new Date("2026-08-25T12:00:00Z"),
  };
  const result = await generateMorningBrief(deps, { userId: "u", budgetCeilingUsd: 5, facts: FULL });
  assertEquals(result.source, "deterministic");
  assertEquals(provider.callCount(), 0);
  assertStringIncludes(result.brief, "ECON outline");
});
