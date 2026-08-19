// Contract test: proves createWhoopOAuthProvider parses WHOOP's publicly documented OAuth
// token + profile response shapes correctly. Cannot call the live API (no WHOOP developer
// credentials exist in this environment) -- stubs `fetch` with a recorded response shape
// instead, same approach as anthropicProvider.test.ts. A live smoke test against the real
// API is still required the first time real WHOOP credentials exist
// (docs/SUPABASE_SETUP.md's WHOOP section).

import { assertEquals, assertMatch, assertRejects } from "jsr:@std/assert@1";
import { createWhoopOAuthProvider } from "./realProvider.ts";

const GOLDEN_TOKEN_RESPONSE = {
  access_token: "whoop-access-abc123",
  refresh_token: "whoop-refresh-xyz789",
  expires_in: 3600,
  scope: "read:sleep read:recovery read:workout read:profile offline",
  token_type: "bearer",
};

const GOLDEN_PROFILE_RESPONSE = { user_id: 987654 };

function stubFetch(handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  const original = globalThis.fetch;
  globalThis.fetch = handler as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

Deno.test("realProvider: exchangeAuthorizationCode sends the authorization_code grant and parses the token response", async () => {
  let capturedUrl: string | undefined;
  let capturedBody: string | undefined;
  const restore = stubFetch((input, init) => {
    capturedUrl = String(input);
    capturedBody = init!.body as string;
    return Promise.resolve(new Response(JSON.stringify(GOLDEN_TOKEN_RESPONSE), { status: 200 }));
  });
  try {
    const provider = createWhoopOAuthProvider("client-id-fake", "client-secret-fake");
    const result = await provider.exchangeAuthorizationCode("auth-code-abc", "https://collegeos.app/whoop/callback");

    assertEquals(capturedUrl, "https://api.prod.whoop.com/oauth/oauth2/token");
    const params = new URLSearchParams(capturedBody);
    assertEquals(params.get("grant_type"), "authorization_code");
    assertEquals(params.get("code"), "auth-code-abc");
    assertEquals(params.get("redirect_uri"), "https://collegeos.app/whoop/callback");
    assertEquals(params.get("client_secret"), "client-secret-fake");

    assertEquals(result.accessToken, "whoop-access-abc123");
    assertEquals(result.refreshToken, "whoop-refresh-xyz789");
    assertEquals(result.scope, GOLDEN_TOKEN_RESPONSE.scope);
    // expires_in is relative seconds -- the provider converts it to an absolute instant.
    const expiresAtMs = new Date(result.expiresAt).getTime();
    assertEquals(expiresAtMs > Date.now() && expiresAtMs <= Date.now() + 3600_000 + 1000, true);
  } finally {
    restore();
  }
});

Deno.test("realProvider: refreshAccessToken sends the refresh_token grant, not authorization_code", async () => {
  let capturedBody: string | undefined;
  const restore = stubFetch((_input, init) => {
    capturedBody = init!.body as string;
    return Promise.resolve(new Response(JSON.stringify(GOLDEN_TOKEN_RESPONSE), { status: 200 }));
  });
  try {
    const provider = createWhoopOAuthProvider("client-id-fake", "client-secret-fake");
    await provider.refreshAccessToken("whoop-refresh-old");

    const params = new URLSearchParams(capturedBody);
    assertEquals(params.get("grant_type"), "refresh_token");
    assertEquals(params.get("refresh_token"), "whoop-refresh-old");
  } finally {
    restore();
  }
});

Deno.test("realProvider: getAuthenticatedUserId sends the access token as a bearer header and returns it as a string", async () => {
  let capturedAuth: string | null | undefined;
  const restore = stubFetch((_input, init) => {
    capturedAuth = new Headers(init!.headers).get("authorization");
    return Promise.resolve(new Response(JSON.stringify(GOLDEN_PROFILE_RESPONSE), { status: 200 }));
  });
  try {
    const provider = createWhoopOAuthProvider("client-id-fake", "client-secret-fake");
    const userId = await provider.getAuthenticatedUserId("whoop-access-abc123");

    assertEquals(capturedAuth, "Bearer whoop-access-abc123");
    assertEquals(userId, "987654");
    assertEquals(typeof userId, "string"); // WHOOP's id is numeric; we always store it as text
  } finally {
    restore();
  }
});

Deno.test("realProvider: a non-2xx token response throws with the status code visible", async () => {
  const restore = stubFetch(() => Promise.resolve(new Response("invalid_grant", { status: 400 })));
  try {
    const provider = createWhoopOAuthProvider("client-id-fake", "client-secret-fake");
    const err = await assertRejects(() => provider.exchangeAuthorizationCode("bad-code", "https://collegeos.app/whoop/callback"));
    assertMatch((err as Error).message, /400/);
  } finally {
    restore();
  }
});

Deno.test("realProvider: a non-2xx profile response throws rather than returning a fabricated user id", async () => {
  const restore = stubFetch(() => Promise.resolve(new Response("unauthorized", { status: 401 })));
  try {
    const provider = createWhoopOAuthProvider("client-id-fake", "client-secret-fake");
    const err = await assertRejects(() => provider.getAuthenticatedUserId("expired-token"));
    assertMatch((err as Error).message, /401/);
  } finally {
    restore();
  }
});
