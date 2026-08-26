// Offline contract tests for the Canvas REST plumbing -- pagination, HTML stripping,
// and response normalization against documented Canvas API shapes (no live Canvas is
// reachable, and none is needed: the poll's correctness is URL/shape logic).

import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  CanvasApiError,
  canvasApiUrl,
  canvasGetAll,
  listAnnouncements,
  nextLink,
  stripCanvasHtml,
  verifyCanvasToken,
} from "./api.ts";

function stubFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

Deno.test("canvasApiUrl: joins base and path regardless of trailing/leading slashes", () => {
  assertEquals(canvasApiUrl("https://x.instructure.com/", "/api/v1/courses"), "https://x.instructure.com/api/v1/courses");
  assertEquals(canvasApiUrl("https://x.instructure.com", "api/v1/courses"), "https://x.instructure.com/api/v1/courses");
});

Deno.test("nextLink: extracts rel=next and returns null on the last page", () => {
  const header = '<https://x.edu/api/v1/courses?page=2>; rel="next",<https://x.edu/api/v1/courses?page=9>; rel="last"';
  assertEquals(nextLink(header), "https://x.edu/api/v1/courses?page=2");
  assertEquals(nextLink('<https://x.edu/api?page=1>; rel="first"'), null);
  assertEquals(nextLink(null), null);
});

Deno.test("stripCanvasHtml: paragraphs and breaks become newlines, entities decode, lists keep bullets", () => {
  const html = "<p>Quiz 4 moved to <b>Oct 10</b>.</p><p>Bring:</p><ul><li>Calculator</li><li>Formula sheet &amp; pencil</li></ul>";
  assertEquals(stripCanvasHtml(html), "Quiz 4 moved to Oct 10.\nBring:\n- Calculator\n- Formula sheet & pencil");
});

Deno.test("stripCanvasHtml: collapses runaway blank lines and trims", () => {
  assertEquals(stripCanvasHtml("<p></p><p></p><p>Hi</p><br><br><br>"), "Hi");
});

Deno.test("canvasGetAll: follows Link rel=next across pages and concatenates", async () => {
  const urls: string[] = [];
  const restore = stubFetch((input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("page=2")) {
      return Promise.resolve(new Response(JSON.stringify([{ id: 3 }]), { status: 200 }));
    }
    return Promise.resolve(
      new Response(JSON.stringify([{ id: 1 }, { id: 2 }]), {
        status: 200,
        headers: { link: '<https://x.instructure.com/api/v1/courses?page=2>; rel="next"' },
      }),
    );
  });
  try {
    const all = await canvasGetAll("https://x.instructure.com", "tok", "/api/v1/courses");
    assertEquals(all.length, 3);
    assertEquals(urls.length, 2);
  } finally {
    restore();
  }
});

Deno.test("canvasGetAll: a non-2xx throws CanvasApiError carrying the status", async () => {
  const restore = stubFetch(() => Promise.resolve(new Response("unauthorized", { status: 401 })));
  try {
    await assertRejects(
      () => canvasGetAll("https://x.instructure.com", "revoked", "/api/v1/courses"),
      CanvasApiError,
      "401",
    );
  } finally {
    restore();
  }
});

Deno.test("listAnnouncements: sends context_codes[], start_date, active_only; normalizes shapes", async () => {
  let capturedUrl = "";
  const restore = stubFetch((input) => {
    capturedUrl = String(input);
    return Promise.resolve(
      new Response(
        JSON.stringify([
          { id: 77, title: "Quiz moved", message: "<p>Now Oct 10</p>", posted_at: "2026-08-25T14:00:00Z", context_code: "course_123" },
          { id: "bad-shape", context_code: "course_123" },
        ]),
        { status: 200 },
      ),
    );
  });
  try {
    const anns = await listAnnouncements("https://x.instructure.com", "tok", ["course_123", "course_456"], "2026-08-12T00:00:00.000Z");
    const url = new URL(capturedUrl);
    assertEquals(url.searchParams.getAll("context_codes[]"), ["course_123", "course_456"]);
    assertEquals(url.searchParams.get("start_date"), "2026-08-12T00:00:00.000Z");
    assertEquals(url.searchParams.get("active_only"), "true");
    assertEquals(anns.length, 1);
    assertEquals(anns[0]!.message, "Now Oct 10");
    assertEquals(anns[0]!.contextCode, "course_123");
  } finally {
    restore();
  }
});

Deno.test("listAnnouncements: no context codes means no fetch at all", async () => {
  let called = false;
  const restore = stubFetch(() => {
    called = true;
    return Promise.resolve(new Response("[]", { status: 200 }));
  });
  try {
    assertEquals(await listAnnouncements("https://x.instructure.com", "tok", [], "2026-08-12T00:00:00.000Z"), []);
    assertEquals(called, false);
  } finally {
    restore();
  }
});

Deno.test("verifyCanvasToken: 401 names the fix; 200 returns the Canvas user's name", async () => {
  let restore = stubFetch(() => Promise.resolve(new Response("", { status: 401 })));
  try {
    const bad = await verifyCanvasToken("https://x.instructure.com", "revoked");
    assertEquals(bad.ok, false);
  } finally {
    restore();
  }
  restore = stubFetch(() => Promise.resolve(new Response(JSON.stringify({ id: 1, name: "Kareem" }), { status: 200 })));
  try {
    const good = await verifyCanvasToken("https://x.instructure.com", "tok");
    assertEquals(good, { ok: true, userName: "Kareem" });
  } finally {
    restore();
  }
});
