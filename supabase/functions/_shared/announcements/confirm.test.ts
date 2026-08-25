import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { applyAnnouncement } from "./confirm.ts";

// Fake client covering the query shapes confirm.ts uses: select-eq-eq-maybeSingle,
// select-eq-single, select-eq-eq (list), update-eq(-eq), insert.
// deno-lint-ignore no-explicit-any
function createFakeClient(seed?: { announcements?: any[]; deliverables?: any[] }) {
  // deno-lint-ignore no-explicit-any
  const state: Record<string, any[]> = {
    announcements: seed?.announcements ?? [
      {
        id: 7,
        user_id: "user-1",
        course_id: 3,
        status: "parsed",
        parsed_diff: {
          changes: [
            {
              kind: "date_change",
              matchedTitle: "Quiz 4",
              newDueDate: "2026-10-10",
              newDueText: null,
              sourceSnippet: "moved",
            },
          ],
        },
      },
    ],
    deliverables: seed?.deliverables ?? [
      { id: 21, user_id: "user-1", course_id: 3, title: "Quiz 4", status: "not_started", due_at: "2026-10-03T00:00:00Z" },
    ],
    profiles: [{ id: "user-1", timezone: "America/Indiana/Indianapolis" }],
  };

  function from(table: string) {
    // deno-lint-ignore no-explicit-any
    const rows = state[table]!;
    return {
      select(_cols: string) {
        // deno-lint-ignore no-explicit-any
        const filters: [string, any][] = [];
        const chain = {
          eq(col: string, val: unknown) {
            filters.push([col, val]);
            return chain;
          },
          maybeSingle() {
            const found = rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null;
            return Promise.resolve({ data: found, error: null });
          },
          single() {
            const found = rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null;
            return Promise.resolve({ data: found, error: found ? null : { message: "not found" } });
          },
          then(resolve: (v: { data: unknown[]; error: null }) => void) {
            resolve({ data: rows.filter((r) => filters.every(([c, v]) => r[c] === v)), error: null });
          },
        };
        return chain;
      },
      update(patch: Record<string, unknown>) {
        // deno-lint-ignore no-explicit-any
        const filters: [string, any][] = [];
        const chain = {
          eq(col: string, val: unknown) {
            filters.push([col, val]);
            return chain;
          },
          then(resolve: (v: { error: null }) => void) {
            for (const row of rows.filter((r) => filters.every(([c, v]) => r[c] === v))) Object.assign(row, patch);
            resolve({ error: null });
          },
        };
        return chain;
      },
      insert(newRows: unknown[]) {
        rows.push(...(newRows as Record<string, unknown>[]));
        return Promise.resolve({ error: null });
      },
    };
  }
  return { client: { from }, state };
}

Deno.test("applyAnnouncement: a confirmed date_change updates the matched deliverable and marks applied", async () => {
  const { client, state } = createFakeClient();
  const result = await applyAnnouncement(client, { announcementId: 7, userId: "user-1", decision: "confirmed" });
  assertEquals(result.ok, true);
  if (result.ok && "applied" in result) assertEquals(result.applied.dateChanges, 1);
  // End-of-day in the user's zone: 23:59 Indiana (UTC-4 in October) = 03:59Z next day.
  assertEquals(state.deliverables![0]!.due_at, "2026-10-11T03:59:00.000Z");
  assertEquals(state.announcements![0]!.status, "applied");
});

Deno.test("applyAnnouncement: an unresolved date refuses the WHOLE confirm and applies nothing", async () => {
  const { client, state } = createFakeClient({
    announcements: [
      {
        id: 7,
        user_id: "user-1",
        course_id: 3,
        status: "parsed",
        parsed_diff: {
          changes: [
            { kind: "date_change", matchedTitle: "Quiz 4", newDueDate: null, newDueText: "during finals week", sourceSnippet: "s" },
          ],
        },
      },
    ],
  });
  const result = await applyAnnouncement(client, { announcementId: 7, userId: "user-1", decision: "confirmed" });
  assertEquals(result.ok, false);
  if (!result.ok) assertStringIncludes(result.error, "finals week");
  assertEquals(state.deliverables![0]!.due_at, "2026-10-03T00:00:00Z");
  assertEquals(state.announcements![0]!.status, "parsed");
});

Deno.test("applyAnnouncement: an unmatched title is all-or-nothing, names the title, applies nothing", async () => {
  const { client, state } = createFakeClient({
    announcements: [
      {
        id: 7,
        user_id: "user-1",
        course_id: 3,
        status: "parsed",
        parsed_diff: {
          changes: [
            { kind: "date_change", matchedTitle: "Quiz 4", newDueDate: "2026-10-10", newDueText: null, sourceSnippet: "s" },
            { kind: "date_change", matchedTitle: "Imaginary Midterm", newDueDate: "2026-10-12", newDueText: null, sourceSnippet: "s" },
          ],
        },
      },
    ],
  });
  const result = await applyAnnouncement(client, { announcementId: 7, userId: "user-1", decision: "confirmed" });
  assertEquals(result.ok, false);
  if (!result.ok) assertStringIncludes(result.error, "Imaginary Midterm");
  // The FIRST change was valid -- proving validate-everything-then-write means it did not land.
  assertEquals(state.deliverables![0]!.due_at, "2026-10-03T00:00:00Z");
});

Deno.test("applyAnnouncement: edited diff is revalidated -- garbage is refused", async () => {
  const { client } = createFakeClient();
  const result = await applyAnnouncement(client, {
    announcementId: 7,
    userId: "user-1",
    decision: "edited",
    editedDiff: { changes: [{ kind: "date_change", matchedTitle: "Quiz 4" }] },
  });
  assertEquals(result.ok, false);
});

Deno.test("applyAnnouncement: edited diff that resolves a date applies and persists the edit", async () => {
  const { client, state } = createFakeClient({
    announcements: [
      {
        id: 7,
        user_id: "user-1",
        course_id: 3,
        status: "parsed",
        parsed_diff: {
          changes: [
            { kind: "date_change", matchedTitle: "Quiz 4", newDueDate: null, newDueText: "finals week", sourceSnippet: "s" },
          ],
        },
      },
    ],
  });
  const result = await applyAnnouncement(client, {
    announcementId: 7,
    userId: "user-1",
    decision: "edited",
    editedDiff: {
      changes: [
        { kind: "date_change", matchedTitle: "Quiz 4", newDueDate: "2026-12-15", newDueText: null, sourceSnippet: "s" },
      ],
    },
  });
  assertEquals(result.ok, true);
  // December: Indiana is UTC-5, so 23:59 local = 04:59Z next day.
  assertEquals(state.deliverables![0]!.due_at, "2026-12-16T04:59:00.000Z");
  assertEquals(state.announcements![0]!.parsed_diff.changes[0].newDueDate, "2026-12-15");
});

Deno.test("applyAnnouncement: new_item inserts a deliverable in the announcement's course", async () => {
  const { client, state } = createFakeClient({
    announcements: [
      {
        id: 7,
        user_id: "user-1",
        course_id: 3,
        status: "parsed",
        parsed_diff: {
          changes: [
            { kind: "new_item", title: "Pop Quiz 5", itemType: "quiz", dueDate: "2026-11-06", dueText: null, sourceSnippet: "s" },
          ],
        },
      },
    ],
  });
  const result = await applyAnnouncement(client, { announcementId: 7, userId: "user-1", decision: "confirmed" });
  assertEquals(result.ok, true);
  const inserted = state.deliverables!.find((d) => d.title === "Pop Quiz 5");
  assertEquals(inserted?.type, "quiz");
  assertEquals(inserted?.course_id, 3);
});

Deno.test("applyAnnouncement: an already-applied announcement is refused (idempotency)", async () => {
  const { client } = createFakeClient({
    announcements: [{ id: 7, user_id: "user-1", course_id: 3, status: "applied", parsed_diff: { changes: [] } }],
  });
  const result = await applyAnnouncement(client, { announcementId: 7, userId: "user-1", decision: "confirmed" });
  assertEquals(result.ok, false);
  if (!result.ok) assertStringIncludes(result.error, "applied");
});

Deno.test("applyAnnouncement: rejected marks the row and touches nothing else", async () => {
  const { client, state } = createFakeClient();
  const result = await applyAnnouncement(client, { announcementId: 7, userId: "user-1", decision: "rejected" });
  assertEquals(result.ok, true);
  assertEquals(state.announcements![0]!.status, "rejected");
  assertEquals(state.deliverables![0]!.due_at, "2026-10-03T00:00:00Z");
});
