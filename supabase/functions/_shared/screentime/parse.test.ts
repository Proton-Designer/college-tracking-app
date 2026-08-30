import { assertEquals } from "jsr:@std/assert@1";
import { parseScreenTime } from "./parse.ts";
import { createFixtureProvider } from "../llm/__fixtures__/fixtureProvider.ts";
import type { GatewayDeps } from "../llm/gateway.ts";
import type { LlmImage } from "../llm/types.ts";

// Same fake-client shape as syllabus/extract.test.ts -- update-by-eq plus a collecting
// insert, over in-memory rows.
// deno-lint-ignore no-explicit-any
function createFakeClient() {
  const state: Record<string, any[]> = {
    screen_time_uploads: [{ id: 1, status: "pending", error_message: null }],
    screen_time_extractions: [],
  };
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
    provider: createFixtureProvider([{ kind: "success", toolInput: { items: [], notScreenTime: false } }]),
    getMonthlySpendUsd: () => Promise.resolve(0),
    logUsage: () => Promise.resolve(),
    now: () => new Date("2026-08-30T00:00:00Z"),
    ...overrides,
  };
}

const IMAGE: LlmImage = { mediaType: "image/png", dataBase64: "aGVsbG8=" };

const BASE_INPUT = { uploadId: 1, userId: "user-1", budgetCeilingUsd: 5, image: IMAGE };

function item(overrides: Record<string, unknown> = {}) {
  return {
    itemType: "category",
    label: "Social",
    minutes: 120,
    confidence: 0.95,
    sourceSnippet: "2h",
    ...overrides,
  };
}

Deno.test("parseScreenTime: a clean reading stages every row as pending, with the total first", async () => {
  const { client, state } = createFakeClient();
  const deps = makeGatewayDeps({
    provider: createFixtureProvider([
      {
        kind: "success",
        toolInput: {
          items: [
            item({ itemType: "total", label: "Daily average", minutes: 254, sourceSnippet: "4h 14m" }),
            item({ label: "Social", minutes: 120 }),
            item({ itemType: "app", label: "Instagram", minutes: 61 }),
          ],
          notScreenTime: false,
        },
      },
    ]),
  });

  const result = await parseScreenTime(client, deps, BASE_INPUT);

  assertEquals(result.kind, "staged");
  assertEquals(state.screen_time_extractions!.length, 3);
  assertEquals(state.screen_time_extractions![0].item_type, "total");
  assertEquals(state.screen_time_extractions![0].minutes, 254);
  assertEquals(
    state.screen_time_extractions!.every((r: Record<string, unknown>) => r.status === "pending"),
    true,
  );
  assertEquals(state.screen_time_uploads![0].status, "parsed");
});

Deno.test("parseScreenTime: a null minutes becomes a field the user fills, never a zero (D10)", async () => {
  const { client, state } = createFakeClient();
  const deps = makeGatewayDeps({
    provider: createFixtureProvider([
      {
        kind: "success",
        toolInput: {
          items: [
            item({ itemType: "total", label: "Daily average", minutes: 254 }),
            item({ label: "Entertainment", minutes: null, confidence: 0.2, sourceSnippet: "cut off" }),
          ],
          notScreenTime: false,
        },
      },
    ]),
  });

  const result = await parseScreenTime(client, deps, BASE_INPUT);

  assertEquals(result.kind, "staged");
  const unread = state.screen_time_extractions!.find((r: Record<string, unknown>) => r.label === "Entertainment")!;
  assertEquals(unread.minutes, null, "an unreadable value must never be stored as 0");
  assertEquals(unread.needs_input, true);
  assertEquals((result as { needsInputCount: number }).needsInputCount, 1);
});

Deno.test("parseScreenTime: a low-confidence number is DISCARDED and handed back as a field", async () => {
  const { client, state } = createFakeClient();
  const deps = makeGatewayDeps({
    provider: createFixtureProvider([
      {
        kind: "success",
        toolInput: {
          items: [
            item({ itemType: "total", label: "Daily average", minutes: 254 }),
            // A number the model produced but could not stand behind. Confirming it would
            // make it indistinguishable from a real reading.
            item({ label: "Productivity", minutes: 47, confidence: 0.3, sourceSnippet: "blurred" }),
          ],
          notScreenTime: false,
        },
      },
    ]),
  });

  await parseScreenTime(client, deps, BASE_INPUT);

  const shaky = state.screen_time_extractions!.find((r: Record<string, unknown>) => r.label === "Productivity")!;
  assertEquals(shaky.minutes, null, "a low-confidence reading must not sit in the field the user checks");
  assertEquals(shaky.needs_input, true);
});

Deno.test("parseScreenTime: every staged row satisfies (minutes is not null) XOR needs_input", async () => {
  const { client, state } = createFakeClient();
  const deps = makeGatewayDeps({
    provider: createFixtureProvider([
      {
        kind: "success",
        toolInput: {
          items: [
            item({ itemType: "total", label: "Daily average", minutes: 254 }),
            item({ label: "Social", minutes: 120 }),
            item({ label: "Other", minutes: null, confidence: 0.1 }),
            item({ label: "Games", minutes: 30, confidence: 0.4 }),
          ],
          notScreenTime: false,
        },
      },
    ]),
  });

  await parseScreenTime(client, deps, BASE_INPUT);

  for (const row of state.screen_time_extractions!) {
    assertEquals(
      (row.minutes != null) !== row.needs_input,
      true,
      `row ${row.label} violates the value-or-prompt invariant`,
    );
  }
});

Deno.test("parseScreenTime: a missing total is synthesised as a field, not a failure", async () => {
  const { client, state } = createFakeClient();
  const deps = makeGatewayDeps({
    provider: createFixtureProvider([
      {
        kind: "success",
        toolInput: { items: [item({ label: "Social", minutes: 120 })], notScreenTime: false },
      },
    ]),
  });

  const result = await parseScreenTime(client, deps, BASE_INPUT);

  assertEquals(result.kind, "staged");
  const total = state.screen_time_extractions!.find((r: Record<string, unknown>) => r.item_type === "total")!;
  assertEquals(total.minutes, null);
  assertEquals(total.needs_input, true);
  assertEquals(state.screen_time_uploads![0].status, "parsed");
});

Deno.test("parseScreenTime: an image that is not a Screen Time screenshot stages nothing", async () => {
  const { client, state } = createFakeClient();
  const deps = makeGatewayDeps({
    provider: createFixtureProvider([{ kind: "success", toolInput: { items: [], notScreenTime: true } }]),
  });

  const result = await parseScreenTime(client, deps, BASE_INPUT);

  assertEquals(result.kind, "notScreenTime");
  assertEquals(state.screen_time_extractions!.length, 0);
  assertEquals(state.screen_time_uploads![0].status, "failed");
});

Deno.test("parseScreenTime: the breakdown is capped, and the total is never one of the dropped rows", async () => {
  const { client, state } = createFakeClient();
  const many = Array.from({ length: 30 }, (_, i) => item({ itemType: "app", label: `App ${i}`, minutes: i + 1 }));
  const deps = makeGatewayDeps({
    provider: createFixtureProvider([
      {
        kind: "success",
        toolInput: {
          // Total last, so a naive slice would drop it.
          items: [...many, item({ itemType: "total", label: "Daily average", minutes: 254 })],
          notScreenTime: false,
        },
      },
    ]),
  });

  await parseScreenTime(client, deps, BASE_INPUT);

  assertEquals(state.screen_time_extractions!.length, 13, "one total plus the 12-row breakdown cap");
  assertEquals(state.screen_time_extractions![0].item_type, "total");
  assertEquals(state.screen_time_extractions![0].minutes, 254);
});

Deno.test("parseScreenTime: a budget breach never reaches the provider and never stages a row", async () => {
  const { client, state } = createFakeClient();
  const provider = createFixtureProvider([{ kind: "success", toolInput: { items: [], notScreenTime: false } }]);
  const deps = makeGatewayDeps({ provider, getMonthlySpendUsd: () => Promise.resolve(999) });

  const result = await parseScreenTime(client, deps, BASE_INPUT);

  assertEquals(result.kind, "budgetExceeded");
  assertEquals(provider.callCount(), 0);
  assertEquals(state.screen_time_extractions!.length, 0);
  assertEquals(state.screen_time_uploads![0].status, "failed");
});

Deno.test("parseScreenTime: the screenshot reaches the model as an image block, not as text", async () => {
  const { client } = createFakeClient();
  const provider = createFixtureProvider([
    {
      kind: "success",
      toolInput: {
        items: [item({ itemType: "total", label: "Daily average", minutes: 254 })],
        notScreenTime: false,
      },
    },
  ]);

  await parseScreenTime(client, makeGatewayDeps({ provider }), BASE_INPUT);

  const request = provider.requests()[0]!;
  assertEquals(request.images, [IMAGE]);
  assertEquals(request.callType, "screen_time_parse");
  assertEquals(request.toolName, "emit_screen_time_reading");
});

Deno.test("parseScreenTime: nothing in this module ever writes the confirmed weekly table", async () => {
  const { client, state } = createFakeClient();
  const deps = makeGatewayDeps({
    provider: createFixtureProvider([
      {
        kind: "success",
        toolInput: {
          items: [item({ itemType: "total", label: "Daily average", minutes: 254 })],
          notScreenTime: false,
        },
      },
    ]),
  });

  await parseScreenTime(client, deps, BASE_INPUT);

  // The fake client only knows the two tables this module is allowed to touch; a write to
  // screen_time_weeks would have thrown on the undefined table above.
  assertEquals(Object.keys(state).sort(), ["screen_time_extractions", "screen_time_uploads"]);
});
