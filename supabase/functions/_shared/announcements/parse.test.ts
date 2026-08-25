import { assertEquals } from "jsr:@std/assert@1";
import { parseAnnouncement, AnnouncementParseResultSchema } from "./parse.ts";
import { createFixtureProvider } from "../llm/__fixtures__/fixtureProvider.ts";
import type { GatewayDeps } from "../llm/gateway.ts";

// Same fake-client shape as extract.test.ts -- update-by-eq over an in-memory row.
// deno-lint-ignore no-explicit-any
function createFakeClient() {
  const state: Record<string, any[]> = {
    announcements: [{ id: 7, status: "pending", parsed_diff: null, parse_confidence: null, failure_reason: null }],
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
    };
  }
  return { client: { from }, state };
}

function makeGatewayDeps(overrides: Partial<GatewayDeps> = {}): GatewayDeps {
  return {
    provider: createFixtureProvider([
      { kind: "success", toolInput: { changes: [], noSchedulableContent: true, confidence: 0.9 } },
    ]),
    getMonthlySpendUsd: () => Promise.resolve(0),
    logUsage: () => Promise.resolve(),
    now: () => new Date("2026-08-25T00:00:00Z"),
    ...overrides,
  };
}

const BASE_INPUT = {
  announcementId: 7,
  userId: "user-1",
  budgetCeilingUsd: 5,
  rawText: "Quiz 4 is moved from Oct 3 to Oct 10. Bring a printed formula sheet.",
  courseItems: [{ title: "Quiz 4", dueDate: "2026-10-03", type: "quiz" }],
};

Deno.test("parseAnnouncement: a real diff lands as status=parsed with the changes staged", async () => {
  const { client, state } = createFakeClient();
  const deps = makeGatewayDeps({
    provider: createFixtureProvider([
      {
        kind: "success",
        toolInput: {
          changes: [
            {
              kind: "date_change",
              matchedTitle: "Quiz 4",
              newDueDate: "2026-10-10",
              newDueText: null,
              sourceSnippet: "Quiz 4 is moved from Oct 3 to Oct 10.",
            },
            { kind: "note", text: "Bring a printed formula sheet.", sourceSnippet: "Bring a printed formula sheet." },
          ],
          noSchedulableContent: false,
          confidence: 0.95,
        },
      },
    ]),
  });

  const result = await parseAnnouncement(client, deps, BASE_INPUT);
  assertEquals(result.kind, "parsed");
  const row = state.announcements![0]!;
  assertEquals(row.status, "parsed");
  assertEquals(row.parsed_diff.changes.length, 2);
  assertEquals(row.parse_confidence, 0.95);
});

Deno.test("parseAnnouncement: no schedulable content files quietly, never as an error", async () => {
  const { client, state } = createFakeClient();
  const result = await parseAnnouncement(client, makeGatewayDeps(), BASE_INPUT);
  assertEquals(result.kind, "noSchedulableContent");
  assertEquals(state.announcements![0]!.status, "no_schedulable_content");
  // The diff stays null -- there is nothing to confirm, and a stale empty diff would
  // make the UI render a confirm step for nothing.
  assertEquals(state.announcements![0]!.parsed_diff, null);
});

Deno.test("parseAnnouncement: an empty changes list is treated as no schedulable content even if the model forgot the flag", async () => {
  const { client, state } = createFakeClient();
  const deps = makeGatewayDeps({
    provider: createFixtureProvider([
      { kind: "success", toolInput: { changes: [], noSchedulableContent: false, confidence: 0.5 } },
    ]),
  });
  const result = await parseAnnouncement(client, deps, BASE_INPUT);
  assertEquals(result.kind, "noSchedulableContent");
  assertEquals(state.announcements![0]!.status, "no_schedulable_content");
});

Deno.test("parseAnnouncement: budget exceeded marks failed and never calls the provider", async () => {
  const { client, state } = createFakeClient();
  const provider = createFixtureProvider([
    { kind: "success", toolInput: { changes: [], noSchedulableContent: true, confidence: 1 } },
  ]);
  const deps = makeGatewayDeps({ provider, getMonthlySpendUsd: () => Promise.resolve(999) });

  const result = await parseAnnouncement(client, deps, BASE_INPUT);
  assertEquals(result.kind, "budgetExceeded");
  assertEquals(state.announcements![0]!.status, "failed");
  assertEquals(provider.callCount(), 0);
});

Deno.test("schema: rejects a date_change whose newDueDate is not YYYY-MM-DD", () => {
  const bad = AnnouncementParseResultSchema.safeParse({
    changes: [
      {
        kind: "date_change",
        matchedTitle: "Quiz 4",
        newDueDate: "Oct 10",
        newDueText: null,
        sourceSnippet: "moved",
      },
    ],
    noSchedulableContent: false,
    confidence: 0.9,
  });
  assertEquals(bad.success, false);
});

Deno.test("schema: accepts an unresolved date carried as text with a null date", () => {
  const ok = AnnouncementParseResultSchema.safeParse({
    changes: [
      {
        kind: "date_change",
        matchedTitle: "Final Exam",
        newDueDate: null,
        newDueText: "during finals week",
        sourceSnippet: "The final moves to finals week.",
      },
    ],
    noSchedulableContent: false,
    confidence: 0.7,
  });
  assertEquals(ok.success, true);
});
