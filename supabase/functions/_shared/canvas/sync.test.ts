// Offline tests for the poll orchestration: connection gating, dedupe on external_id,
// unmapped-context skipping, and the watermark/overlap window math. Fake Supabase
// client supports exactly the chains sync.ts uses (confirm.test.ts's convention);
// Canvas itself is a stubbed fetch.

import { assertEquals } from "jsr:@std/assert@1";
import { pollAnnouncementsForUser } from "./sync.ts";

function stubFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

interface FakeState {
  connections: Record<string, unknown>[];
  links: Record<string, unknown>[];
  announcements: Record<string, unknown>[];
  token: string | null;
}

// deno-lint-ignore no-explicit-any
function createFakeClient(state: FakeState): any {
  let nextId = 500;
  return {
    rpc(fn: string, _args: Record<string, unknown>) {
      if (fn === "get_oauth_token") return Promise.resolve({ data: state.token, error: null });
      return Promise.resolve({ data: null, error: { message: `unexpected rpc ${fn}` } });
    },
    from(table: string) {
      if (table === "canvas_connections") {
        return {
          select(_cols: string) {
            return {
              eq(_col: string, val: unknown) {
                return {
                  maybeSingle: () =>
                    Promise.resolve({ data: state.connections.find((c) => c.user_id === val) ?? null, error: null }),
                };
              },
            };
          },
          update(patch: Record<string, unknown>) {
            const builder = {
              predicates: [] as Array<(r: Record<string, unknown>) => boolean>,
              eq(col: string, val: unknown) {
                builder.predicates.push((r) => r[col] === val);
                return builder;
              },
              then(resolve: (v: unknown) => void) {
                const row = state.connections.find((r) => builder.predicates.every((p) => p(r)));
                if (row) Object.assign(row, patch);
                resolve({ data: null, error: null });
              },
            };
            return builder;
          },
        };
      }
      if (table === "canvas_course_links") {
        return {
          select(_cols: string) {
            return {
              eq(_col: string, val: unknown) {
                return Promise.resolve({ data: state.links.filter((l) => l.user_id === val), error: null });
              },
            };
          },
        };
      }
      if (table === "announcements") {
        return {
          select(_cols: string) {
            return {
              eq(_col: string, val: unknown) {
                return {
                  in(_col2: string, vals: string[]) {
                    return Promise.resolve({
                      data: state.announcements.filter((a) => a.user_id === val && vals.includes(String(a.external_id))),
                      error: null,
                    });
                  },
                };
              },
            };
          },
          insert(payload: Record<string, unknown>) {
            return {
              select(_cols: string) {
                return {
                  single: () => {
                    const row = { id: nextId++, ...payload };
                    state.announcements.push(row);
                    return Promise.resolve({ data: row, error: null });
                  },
                };
              },
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
}

const NOW = new Date("2026-08-26T15:00:00.000Z");

function canvasResponds(items: unknown[]): () => void {
  return stubFetch(() => Promise.resolve(new Response(JSON.stringify(items), { status: 200 })));
}

Deno.test("poll: not connected / no links / no token short-circuit in that order", async () => {
  const noConn = createFakeClient({ connections: [], links: [], announcements: [], token: null });
  assertEquals(await pollAnnouncementsForUser(noConn, "u1", () => NOW), { kind: "notConnected" });

  const noLinks = createFakeClient({
    connections: [{ id: 1, user_id: "u1", base_url: "https://x.instructure.com", last_polled_at: null }],
    links: [],
    announcements: [],
    token: "tok",
  });
  assertEquals(await pollAnnouncementsForUser(noLinks, "u1", () => NOW), { kind: "noLinks" });

  const noToken = createFakeClient({
    connections: [{ id: 1, user_id: "u1", base_url: "https://x.instructure.com", last_polled_at: null }],
    links: [{ user_id: "u1", course_id: 10, canvas_course_id: 123 }],
    announcements: [],
    token: null,
  });
  assertEquals(await pollAnnouncementsForUser(noToken, "u1", () => NOW), { kind: "noToken" });
});

Deno.test("poll: stages new announcements, dedupes staged ones, skips unmapped contexts, advances watermark", async () => {
  const state: FakeState = {
    connections: [{ id: 1, user_id: "u1", base_url: "https://x.instructure.com", last_polled_at: "2026-08-26T10:00:00.000Z" }],
    links: [{ user_id: "u1", course_id: 10, canvas_course_id: 123 }],
    announcements: [{ id: 400, user_id: "u1", external_id: "77", course_id: 10 }],
    token: "tok",
  };
  const client = createFakeClient(state);
  const restore = canvasResponds([
    { id: 77, title: "Already staged", message: "", posted_at: null, context_code: "course_123" },
    { id: 88, title: "Quiz moved", message: "<p>Oct 10</p>", posted_at: null, context_code: "course_123" },
    { id: 99, title: "Unlinked course", message: "", posted_at: null, context_code: "course_999" },
  ]);
  try {
    const result = await pollAnnouncementsForUser(client, "u1", () => NOW);
    assertEquals(result.kind, "polled");
    if (result.kind !== "polled") return;
    assertEquals(result.fetched, 3);
    assertEquals(result.inserted.length, 1);
    assertEquals(result.inserted[0]!.courseId, 10);
    assertEquals(result.inserted[0]!.rawText, "Quiz moved\n\nOct 10");
    assertEquals(result.skippedExisting, 1);
    assertEquals(result.skippedUnmapped, 1);

    const staged = state.announcements.find((a) => a.external_id === "88");
    assertEquals(staged?.source, "canvas");
    assertEquals(state.connections[0]!.last_polled_at, NOW.toISOString());
  } finally {
    restore();
  }
});

Deno.test("poll: an announcement longer than the cap is staged truncated, not dropped, and counted", async () => {
  const state: FakeState = {
    connections: [{ id: 1, user_id: "u1", base_url: "https://x.instructure.com", last_polled_at: null }],
    links: [{ user_id: "u1", course_id: 10, canvas_course_id: 123 }],
    announcements: [],
    token: "tok",
  };
  const client = createFakeClient(state);
  const hugeMessage = "x".repeat(25_000);
  const restore = canvasResponds([
    { id: 55, title: "Long one", message: hugeMessage, posted_at: null, context_code: "course_123" },
  ]);
  try {
    const result = await pollAnnouncementsForUser(client, "u1", () => NOW);
    assertEquals(result.kind, "polled");
    if (result.kind !== "polled") return;
    // Not dropped: an unattended cron path silently skipping a real announcement is
    // worse than staging a truncated one the user can still see and act on.
    assertEquals(result.inserted.length, 1);
    assertEquals(result.truncated, 1);
    assertEquals(result.inserted[0]!.truncated, true);
    assertEquals(result.inserted[0]!.rawText.length, 20_000);
    // Same 20,000-char bound as parse-announcement's manual-paste path -- the
    // asymmetry this closes.
    assertEquals(state.announcements[0]!.raw_text, result.inserted[0]!.rawText);
  } finally {
    restore();
  }
});

Deno.test("poll window: first poll looks back 14 days; later polls overlap the watermark by 24h", async () => {
  const captured: string[] = [];
  const restore = stubFetch((input) => {
    captured.push(new URL(String(input)).searchParams.get("start_date")!);
    return Promise.resolve(new Response("[]", { status: 200 }));
  });
  try {
    const first = createFakeClient({
      connections: [{ id: 1, user_id: "u1", base_url: "https://x.instructure.com", last_polled_at: null }],
      links: [{ user_id: "u1", course_id: 10, canvas_course_id: 123 }],
      announcements: [],
      token: "tok",
    });
    await pollAnnouncementsForUser(first, "u1", () => NOW);
    assertEquals(captured[0], new Date(NOW.getTime() - 14 * 24 * 3600_000).toISOString());

    const later = createFakeClient({
      connections: [{ id: 1, user_id: "u1", base_url: "https://x.instructure.com", last_polled_at: "2026-08-26T10:00:00.000Z" }],
      links: [{ user_id: "u1", course_id: 10, canvas_course_id: 123 }],
      announcements: [],
      token: "tok",
    });
    await pollAnnouncementsForUser(later, "u1", () => NOW);
    assertEquals(captured[1], new Date(new Date("2026-08-26T10:00:00.000Z").getTime() - 24 * 3600_000).toISOString());
  } finally {
    restore();
  }
});
