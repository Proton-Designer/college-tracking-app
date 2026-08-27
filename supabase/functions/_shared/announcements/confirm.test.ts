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
          // Cloned, not the live row: a real SELECT returns a snapshot at query time, not a
          // handle onto mutable server state -- concurrency tests rely on this to model two
          // requests that both read 'parsed' before either one writes.
          maybeSingle() {
            const found = rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null;
            return Promise.resolve({ data: found ? { ...found } : null, error: null });
          },
          single() {
            const found = rows.find((r) => filters.every(([c, v]) => r[c] === v)) ?? null;
            return Promise.resolve({ data: found ? { ...found } : null, error: found ? null : { message: "not found" } });
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
          // Mirrors real supabase-js: `.select()` after an update returns the rows that
          // matched the filters (post-mutation), so a CAS guard can check affected count.
          select(_cols: string) {
            const matched = rows.filter((r) => filters.every(([c, v]) => r[c] === v));
            for (const row of matched) Object.assign(row, patch);
            return Promise.resolve({ data: matched.map((r) => ({ id: r.id })), error: null });
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

Deno.test("applyAnnouncement: two concurrent confirms on the same announcement never double-apply (CAS guard)", async () => {
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
    deliverables: [],
  });

  // Fired together (not awaited in sequence) so both calls pass the initial read-check
  // before either has written anything -- the exact race window the CAS guard closes.
  const [first, second] = await Promise.all([
    applyAnnouncement(client, { announcementId: 7, userId: "user-1", decision: "confirmed" }),
    applyAnnouncement(client, { announcementId: 7, userId: "user-1", decision: "confirmed" }),
  ]);

  const outcomes = [first, second];
  assertEquals(outcomes.filter((r) => r.ok && "applied" in r).length, 1, "exactly one call wins the claim and applies");
  assertEquals(outcomes.filter((r) => r.ok && "alreadySettled" in r).length, 1, "the other finds it already settled, not an error");

  // The defect this guards against: without it, both calls would insert the same
  // new_item deliverable (no unique constraint on deliverables(user_id, course_id,
  // title) exists to catch it at the DB level).
  const created = state.deliverables!.filter((d) => d.title === "Pop Quiz 5");
  assertEquals(created.length, 1, "the deliverable is created exactly once, never twice");
  assertEquals(state.announcements![0]!.status, "applied");
});

Deno.test("applyAnnouncement: a concurrent confirm+reject race settles exactly one way", async () => {
  const { client, state } = createFakeClient({
    announcements: [
      {
        id: 7,
        user_id: "user-1",
        course_id: 3,
        status: "parsed",
        // A real, valid diff (DiffSchema requires changes.min(1)) so the confirm path
        // actually reaches the claim instead of failing validation before the race.
        parsed_diff: {
          changes: [
            { kind: "new_item", title: "Pop Quiz 6", itemType: "quiz", dueDate: "2026-11-06", dueText: null, sourceSnippet: "s" },
          ],
        },
      },
    ],
    deliverables: [],
  });

  const [confirmResult, rejectResult] = await Promise.all([
    applyAnnouncement(client, { announcementId: 7, userId: "user-1", decision: "confirmed" }),
    applyAnnouncement(client, { announcementId: 7, userId: "user-1", decision: "rejected" }),
  ]);

  const outcomes = [confirmResult, rejectResult];
  const settledCount = outcomes.filter((r) => r.ok && ("applied" in r || "rejected" in r)).length;
  const alreadySettledCount = outcomes.filter((r) => r.ok && "alreadySettled" in r).length;
  assertEquals(settledCount, 1, "exactly one decision actually lands");
  assertEquals(alreadySettledCount, 1, "the loser reports alreadySettled, not an error");
  const finalStatus = state.announcements![0]!.status;
  assertEquals(["applied", "rejected"].includes(finalStatus), true);
  // Whichever way it settled, the deliverable exists iff confirm won -- never a
  // deliverable created by a call that reports it lost the race.
  const created = state.deliverables!.filter((d) => d.title === "Pop Quiz 6");
  assertEquals(created.length, finalStatus === "applied" ? 1 : 0);
});

Deno.test("applyAnnouncement: rejected marks the row and touches nothing else", async () => {
  const { client, state } = createFakeClient();
  const result = await applyAnnouncement(client, { announcementId: 7, userId: "user-1", decision: "rejected" });
  assertEquals(result.ok, true);
  assertEquals(state.announcements![0]!.status, "rejected");
  assertEquals(state.deliverables![0]!.due_at, "2026-10-03T00:00:00Z");
});
