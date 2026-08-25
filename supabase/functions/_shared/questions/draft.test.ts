import { assertEquals } from "jsr:@std/assert@1";
import { draftQuestions } from "./draft.ts";
import { createFixtureProvider } from "../llm/__fixtures__/fixtureProvider.ts";
import type { GatewayDeps } from "../llm/gateway.ts";

function deps(overrides: Partial<GatewayDeps> = {}): GatewayDeps {
  return {
    provider: createFixtureProvider([
      {
        kind: "success",
        toolInput: {
          questions: [{ prompt: "Why does sampling bias matter?", answer: "Because...", topic: "sampling", sourceHint: null }],
          tooThin: false,
        },
      },
    ]),
    getMonthlySpendUsd: () => Promise.resolve(0),
    logUsage: () => Promise.resolve(),
    now: () => new Date("2026-08-25T12:00:00Z"),
    ...overrides,
  };
}

const INPUT = { userId: "u", budgetCeilingUsd: 5, notesText: "notes ".repeat(100) };

Deno.test("draftQuestions: returns proposals, stores nothing (there is nothing to store)", async () => {
  const result = await draftQuestions(deps(), INPUT);
  assertEquals(result.kind, "drafted");
  if (result.kind === "drafted") assertEquals(result.questions.length, 1);
});

Deno.test("draftQuestions: tooThin and empty-list both file as tooThin, never an error", async () => {
  const thin = await draftQuestions(
    deps({ provider: createFixtureProvider([{ kind: "success", toolInput: { questions: [], tooThin: true } }]) }),
    INPUT,
  );
  assertEquals(thin.kind, "tooThin");
  const empty = await draftQuestions(
    deps({ provider: createFixtureProvider([{ kind: "success", toolInput: { questions: [], tooThin: false } }]) }),
    INPUT,
  );
  assertEquals(empty.kind, "tooThin");
});

Deno.test("draftQuestions: budget exceeded never calls the provider", async () => {
  const provider = createFixtureProvider([{ kind: "success", toolInput: { questions: [], tooThin: true } }]);
  const result = await draftQuestions(deps({ provider, getMonthlySpendUsd: () => Promise.resolve(999) }), INPUT);
  assertEquals(result.kind, "budgetExceeded");
  assertEquals(provider.callCount(), 0);
});
