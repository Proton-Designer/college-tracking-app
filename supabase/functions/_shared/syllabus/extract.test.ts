import { assertEquals } from "jsr:@std/assert@1";
import { extractSyllabus } from "./extract.ts";
import { createFixtureProvider } from "../llm/__fixtures__/fixtureProvider.ts";
import type { GatewayDeps } from "../llm/gateway.ts";

// deno-lint-ignore no-explicit-any
function createFakeClient() {
  const state: Record<string, any[]> = { syllabus_uploads: [{ id: 1, extraction_status: "pending" }], syllabus_extractions: [] };
  function from(table: string) {
    return {
      update(patch: Record<string, unknown>) {
        return {
          eq: (col: string, val: unknown) => {
            const row = state[table]!.find((r) => r[col] === val);
            if (row) Object.assign(row, patch);
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
      insert(rows: unknown[]) {
        state[table]!.push(...(rows as Record<string, unknown>[]));
        return Promise.resolve({ error: null });
      },
    };
  }
  return { client: { from }, state };
}

function makeGatewayDeps(overrides: Partial<GatewayDeps> = {}): GatewayDeps {
  return {
    provider: createFixtureProvider([{ kind: "success", toolInput: { items: [], lowQualitySourceText: false } }]),
    getMonthlySpendUsd: () => Promise.resolve(0),
    logUsage: () => Promise.resolve(),
    now: () => new Date("2026-08-19T00:00:00Z"),
    ...overrides,
  };
}

const GOOD_TEXT = "BIOL 23000 Syllabus. ".repeat(30) + "Homework 40%, Exams 60%.";

Deno.test("extractSyllabus: low-quality source text short-circuits before any LLM call", async () => {
  const { client, state } = createFakeClient();
  const provider = createFixtureProvider([{ kind: "success", toolInput: { items: [], lowQualitySourceText: false } }]);
  const deps = makeGatewayDeps({ provider });

  const result = await extractSyllabus(client, deps, {
    uploadId: 1,
    userId: "user-1",
    budgetCeilingUsd: 5,
    extractedText: "   ",
  });

  assertEquals(result.kind, "textTooLowQuality");
  assertEquals(provider.callCount(), 0, "a garbage string must never reach the model");
  assertEquals(state.syllabus_uploads![0].extraction_status, "failed");
});

Deno.test("extractSyllabus: a successful extraction stages every item as pending", async () => {
  const { client, state } = createFakeClient();
  const provider = createFixtureProvider([
    {
      kind: "success",
      toolInput: {
        items: [
          { itemType: "assignment", payload: { title: "HW1", type: "problem_set", dueDate: "2026-09-15" }, confidence: 0.9, sourceSnippet: "HW1 due Sep 15" },
        ],
        lowQualitySourceText: false,
      },
    },
  ]);
  const deps = makeGatewayDeps({ provider });

  const result = await extractSyllabus(client, deps, {
    uploadId: 1,
    userId: "user-1",
    budgetCeilingUsd: 5,
    extractedText: GOOD_TEXT,
  });

  assertEquals(result, { kind: "staged", uploadId: 1, itemCount: 1 });
  assertEquals(state.syllabus_extractions!.length, 1);
  assertEquals(state.syllabus_extractions![0].status, "pending");
  assertEquals(state.syllabus_uploads![0].extraction_status, "completed");
});

Deno.test("extractSyllabus: model-reported low-quality text marks the upload failed, stages nothing", async () => {
  const { client, state } = createFakeClient();
  const provider = createFixtureProvider([{ kind: "success", toolInput: { items: [], lowQualitySourceText: true } }]);
  const deps = makeGatewayDeps({ provider });

  const result = await extractSyllabus(client, deps, {
    uploadId: 1,
    userId: "user-1",
    budgetCeilingUsd: 5,
    extractedText: GOOD_TEXT,
  });

  assertEquals(result.kind, "textTooLowQuality");
  assertEquals(state.syllabus_extractions!.length, 0);
});

Deno.test("extractSyllabus: a budget-exceeded gateway result marks the upload failed with a clear reason", async () => {
  const { client, state } = createFakeClient();
  const deps = makeGatewayDeps({ getMonthlySpendUsd: () => Promise.resolve(9999) });

  const result = await extractSyllabus(client, deps, {
    uploadId: 1,
    userId: "user-1",
    budgetCeilingUsd: 5,
    extractedText: GOOD_TEXT,
  });

  assertEquals(result.kind, "budgetExceeded");
  assertEquals(state.syllabus_uploads![0].extraction_status, "failed");
});
