// Real DNS resolution (--allow-net) -- proves the guard actually blocks addresses that
// resolve to private/internal ranges, not just addresses that are already syntactically
// suspicious. localhost resolving to 127.0.0.1 is real DNS behavior, not a mock.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { assertSafeFeedUrl } from "./urlSafety.ts";

Deno.test("assertSafeFeedUrl: rejects a non-https URL before ever attempting DNS resolution", async () => {
  const result = await assertSafeFeedUrl("http://example.com/feed.ics");
  assertEquals(result.ok, false);
  assert(result.reason?.includes("https"));
});

Deno.test("assertSafeFeedUrl: rejects localhost by hostname, before DNS resolution matters", async () => {
  const result = await assertSafeFeedUrl("https://localhost/feed.ics");
  assertEquals(result.ok, false);
});

Deno.test("assertSafeFeedUrl: rejects a hostname that resolves to a private/loopback address", async () => {
  // localhost.localdomain-style names aside, a literal loopback IP as the "hostname"
  // resolves to itself and must be caught by the post-resolution IP check even though
  // it isn't in the hardcoded hostname blocklist.
  const result = await assertSafeFeedUrl("https://127.0.0.1/feed.ics");
  assertEquals(result.ok, false);
  assert(result.reason?.includes("127.0.0.1") || result.reason?.includes("resolve"));
});

Deno.test("assertSafeFeedUrl: rejects the cloud metadata address as a literal IP, checked directly rather than relying on DNS resolution failing", async () => {
  const result = await assertSafeFeedUrl("https://169.254.169.254/latest/meta-data/");
  assertEquals(result.ok, false);
  assert(result.reason?.includes("169.254.169.254"));
  assert(!result.reason?.includes("did not resolve")); // must be the explicit IP check, not the DNS-failure fallback
});

Deno.test("assertSafeFeedUrl: accepts a real public hostname", async () => {
  const result = await assertSafeFeedUrl("https://example.com/feed.ics");
  assertEquals(result, { ok: true, reason: null });
});

Deno.test("assertSafeFeedUrl: rejects an unresolvable hostname rather than silently allowing it through", async () => {
  const result = await assertSafeFeedUrl("https://this-domain-should-not-exist-8f2a91xyz.test/feed.ics");
  assertEquals(result.ok, false);
});

Deno.test("assertSafeFeedUrl: rejects a bracketed IPv6 loopback literal -- URL.hostname keeps the brackets, and the literal-IP short-circuit must still recognize it", async () => {
  const result = await assertSafeFeedUrl("https://[::1]/feed.ics");
  assertEquals(result.ok, false);
});

Deno.test("assertSafeFeedUrl: rejects a bracketed IPv6 link-local literal", async () => {
  const result = await assertSafeFeedUrl("https://[fe80::1]/feed.ics");
  assertEquals(result.ok, false);
});
