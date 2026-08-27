// Offline tests for the grades staging + confirmation: submission filtering, the
// dedupe/regrade rules, the name-match suggestion, and every refusal the confirm can
// issue -- especially the points-scale refusal, which is the never-fabricate rule
// applied to someone else's numbers.

import { assertEquals } from "jsr:@std/assert@1";
import { listGradedSubmissions } from "./api.ts";
import { decideGradeExtraction, pollGradesForUser } from "./grades.ts";

function stubFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

Deno.test("listGradedSubmissions: keeps only graded, posted, scored rows with assignment context", async () => {
  const restore = stubFetch(() =>
    Promise.resolve(
      new Response(
        JSON.stringify([
          { workflow_state: "graded", score: 42, posted_at: "2026-08-25T00:00:00Z", graded_at: "2026-08-24T00:00:00Z", assignment: { id: 900, name: "Quiz 2", points_possible: 50 } },
          { workflow_state: "graded", score: 30, posted_at: null, assignment: { id: 901, name: "Hidden", points_possible: 50 } },
          { workflow_state: "submitted", score: null, posted_at: null, assignment: { id: 902, name: "Ungraded" } },
          { workflow_state: "graded", score: 10, posted_at: "2026-08-25T00:00:00Z" },
        ]),
        { status: 200 },
      ),
    ),
  );
  try {
    const subs = await listGradedSubmissions("https://x.instructure.com", "tok", 123);
    assertEquals(subs, [
      { assignmentId: 900, assignmentName: "Quiz 2", score: 42, pointsPossible: 50, gradedAt: "2026-08-24T00:00:00Z" },
    ]);
  } finally {
    restore();
  }
});

interface GradeFakeState {
  connections: Record<string, unknown>[];
  links: Record<string, unknown>[];
  extractions: Record<string, unknown>[];
  gradeItems: Record<string, unknown>[];
  token: string | null;
}

// deno-lint-ignore no-explicit-any
function createFakeClient(state: GradeFakeState): any {
  let nextId = 700;
  function matchAll(rows: Record<string, unknown>[], preds: Array<[string, unknown]>) {
    return rows.filter((r) => preds.every(([col, val]) => r[col] === val));
  }
  return {
    rpc(fn: string) {
      if (fn === "get_oauth_token") return Promise.resolve({ data: state.token, error: null });
      return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
    },
    from(table: string) {
      const rows =
        table === "canvas_connections"
          ? state.connections
          : table === "canvas_course_links"
            ? state.links
            : table === "canvas_grade_extractions"
              ? state.extractions
              : table === "grade_items"
                ? state.gradeItems
                : null;
      if (rows == null) throw new Error(`unexpected table ${table}`);
      return {
        select(_cols: string) {
          const preds: Array<[string, unknown]> = [];
          const builder = {
            eq(col: string, val: unknown) {
              preds.push([col, val]);
              return builder;
            },
            in(col: string, vals: unknown[]) {
              return Promise.resolve({ data: rows.filter((r) => preds.every(([c, v]) => r[c] === v) && vals.includes(r[col])), error: null });
            },
            // Cloned, not the live row: a real SELECT returns a snapshot at query time --
            // concurrency tests rely on this to model two requests that both read
            // 'pending' before either one writes.
            maybeSingle() {
              const found = matchAll(rows, preds)[0] ?? null;
              return Promise.resolve({ data: found ? { ...found } : null, error: null });
            },
            then(resolve: (v: unknown) => void) {
              resolve({ data: matchAll(rows, preds), error: null });
            },
          };
          return builder;
        },
        insert(payload: Record<string, unknown>) {
          const row = { id: nextId++, status: "pending", ...payload };
          rows.push(row);
          return Promise.resolve({ data: null, error: null });
        },
        update(patch: Record<string, unknown>) {
          const preds: Array<[string, unknown]> = [];
          const builder = {
            eq(col: string, val: unknown) {
              preds.push([col, val]);
              return builder;
            },
            // Mirrors real supabase-js: `.select()` after an update returns the rows
            // that matched the filters (post-mutation), so a CAS guard can check
            // affected count.
            select(_cols: string) {
              const matched = matchAll(rows, preds);
              for (const row of matched) Object.assign(row, patch);
              return Promise.resolve({ data: matched.map((r) => ({ id: r.id })), error: null });
            },
            then(resolve: (v: unknown) => void) {
              for (const row of matchAll(rows, preds)) Object.assign(row, patch);
              resolve({ data: null, error: null });
            },
          };
          return builder;
        },
      };
    },
  };
}

const CONNECTED: Pick<GradeFakeState, "connections" | "links"> = {
  connections: [{ id: 1, user_id: "u1", base_url: "https://x.instructure.com" }],
  links: [{ user_id: "u1", course_id: 10, canvas_course_id: 123 }],
};

Deno.test("pollGrades: stages new grades with a case-insensitive name-match suggestion", async () => {
  const state: GradeFakeState = {
    ...structuredClone(CONNECTED),
    extractions: [],
    gradeItems: [{ id: 55, user_id: "u1", course_id: 10, name: "quiz 2" }],
    token: "tok",
  };
  const restore = stubFetch(() =>
    Promise.resolve(
      new Response(
        JSON.stringify([
          { workflow_state: "graded", score: 42, posted_at: "x", assignment: { id: 900, name: "Quiz 2", points_possible: 50 } },
        ]),
        { status: 200 },
      ),
    ),
  );
  try {
    const result = await pollGradesForUser(createFakeClient(state), "u1");
    assertEquals(result, { kind: "polled", fetched: 1, staged: 1, updated: 0, skippedSettled: 0 });
    assertEquals(state.extractions[0]!.suggested_grade_item_id, 55);
    assertEquals(state.extractions[0]!.status, "pending");
  } finally {
    restore();
  }
});

Deno.test("pollGrades: settled rows never re-stage; a pending regrade updates the score", async () => {
  const state: GradeFakeState = {
    ...structuredClone(CONNECTED),
    extractions: [
      { id: 1, user_id: "u1", canvas_assignment_id: 900, status: "applied", score: 40 },
      { id: 2, user_id: "u1", canvas_assignment_id: 901, status: "pending", score: 30 },
    ],
    gradeItems: [],
    token: "tok",
  };
  const restore = stubFetch(() =>
    Promise.resolve(
      new Response(
        JSON.stringify([
          { workflow_state: "graded", score: 45, posted_at: "x", assignment: { id: 900, name: "A", points_possible: 50 } },
          { workflow_state: "graded", score: 35, posted_at: "x", assignment: { id: 901, name: "B", points_possible: 50 } },
        ]),
        { status: 200 },
      ),
    ),
  );
  try {
    const result = await pollGradesForUser(createFakeClient(state), "u1");
    assertEquals(result, { kind: "polled", fetched: 2, staged: 0, updated: 1, skippedSettled: 1 });
    assertEquals(state.extractions[0]!.score, 40); // applied row untouched
    assertEquals(state.extractions[1]!.score, 35); // pending regrade refreshed
  } finally {
    restore();
  }
});

Deno.test("decideGrade: apply writes points_earned and settles; second decision refuses", async () => {
  const state: GradeFakeState = {
    ...structuredClone(CONNECTED),
    extractions: [{ id: 9, user_id: "u1", course_id: 10, canvas_assignment_id: 900, score: 42, points_possible: 50, status: "pending" }],
    gradeItems: [{ id: 55, user_id: "u1", course_id: 10, name: "Quiz 2", points_possible: 50, points_earned: null }],
    token: "tok",
  };
  const client = createFakeClient(state);
  const applied = await decideGradeExtraction(client, { userId: "u1", extractionId: 9, decision: "applied", gradeItemId: 55 });
  assertEquals(applied, { kind: "applied", gradeItemId: 55, scorePct: 84 });
  assertEquals(state.gradeItems[0]!.points_earned, 42);
  assertEquals(state.extractions[0]!.status, "applied");

  const again = await decideGradeExtraction(client, { userId: "u1", extractionId: 9, decision: "applied", gradeItemId: 55 });
  assertEquals(again.kind, "refused");
});

Deno.test("decideGrade: refusals -- missing target, cross-course target, points-scale mismatch", async () => {
  const state: GradeFakeState = {
    ...structuredClone(CONNECTED),
    extractions: [{ id: 9, user_id: "u1", course_id: 10, canvas_assignment_id: 900, score: 42, points_possible: 50, status: "pending" }],
    gradeItems: [
      { id: 56, user_id: "u1", course_id: 11, name: "Other course", points_possible: 50 },
      { id: 57, user_id: "u1", course_id: 10, name: "Wrong scale", points_possible: 100 },
    ],
    token: "tok",
  };
  const client = createFakeClient(state);

  const noTarget = await decideGradeExtraction(client, { userId: "u1", extractionId: 9, decision: "applied" });
  assertEquals(noTarget.kind, "refused");

  const crossCourse = await decideGradeExtraction(client, { userId: "u1", extractionId: 9, decision: "applied", gradeItemId: 56 });
  assertEquals(crossCourse.kind, "refused");

  const wrongScale = await decideGradeExtraction(client, { userId: "u1", extractionId: 9, decision: "applied", gradeItemId: 57 });
  assertEquals(wrongScale.kind, "refused");
  if (wrongScale.kind === "refused") assertEquals(wrongScale.reason.includes("rescaled"), true);

  // Every refusal left the world untouched.
  assertEquals(state.extractions[0]!.status, "pending");
  assertEquals(state.gradeItems[1]!.points_earned, undefined);
});

Deno.test("decideGrade: two concurrent applies on the same staged grade never double-write the Ledger (CAS guard)", async () => {
  const state: GradeFakeState = {
    ...structuredClone(CONNECTED),
    extractions: [{ id: 9, user_id: "u1", course_id: 10, canvas_assignment_id: 900, score: 42, points_possible: 50, status: "pending" }],
    gradeItems: [{ id: 55, user_id: "u1", course_id: 10, name: "Quiz 2", points_possible: 50, points_earned: null }],
    token: "tok",
  };
  const client = createFakeClient(state);

  // Fired together so both calls pass the pending-status read before either has claimed
  // the row -- the exact race window the CAS guard closes.
  const [first, second] = await Promise.all([
    decideGradeExtraction(client, { userId: "u1", extractionId: 9, decision: "applied", gradeItemId: 55 }),
    decideGradeExtraction(client, { userId: "u1", extractionId: 9, decision: "applied", gradeItemId: 55 }),
  ]);

  const outcomes = [first, second];
  assertEquals(outcomes.filter((r) => r.kind === "applied").length, 1, "exactly one call wins the claim and applies");
  assertEquals(outcomes.filter((r) => r.kind === "alreadySettled").length, 1, "the other finds it already settled, not a refusal");

  // The defect this guards against: without the guard, both calls would write
  // points_earned -- harmless here since both write the same value, but the general
  // shape (two concurrent settles both mutating the Ledger) is what the guard forbids.
  assertEquals(state.gradeItems[0]!.points_earned, 42);
  assertEquals(state.extractions[0]!.status, "applied");
});

Deno.test("decideGrade: reject settles without touching the Ledger", async () => {
  const state: GradeFakeState = {
    ...structuredClone(CONNECTED),
    extractions: [{ id: 9, user_id: "u1", course_id: 10, canvas_assignment_id: 900, score: 42, points_possible: 50, status: "pending" }],
    gradeItems: [{ id: 55, user_id: "u1", course_id: 10, name: "Quiz 2", points_possible: 50 }],
    token: "tok",
  };
  const client = createFakeClient(state);
  const rejected = await decideGradeExtraction(client, { userId: "u1", extractionId: 9, decision: "rejected" });
  assertEquals(rejected, { kind: "rejected" });
  assertEquals(state.extractions[0]!.status, "rejected");
  assertEquals(state.gradeItems[0]!.points_earned, undefined);
});
