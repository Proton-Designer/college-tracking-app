import { assertEquals } from "jsr:@std/assert@1";
import { apiErr, apiOk, getVerifiedCaller, handleCorsPreflight } from "./http.ts";

Deno.test("handleCorsPreflight: returns a 204 for OPTIONS, null otherwise", () => {
  const preflight = handleCorsPreflight(new Request("http://x", { method: "OPTIONS" }));
  assertEquals(preflight?.status, 204);

  const notPreflight = handleCorsPreflight(new Request("http://x", { method: "POST" }));
  assertEquals(notPreflight, null);
});

Deno.test("apiOk / apiErr: consistent { ok } response shape", async () => {
  const ok = apiOk({ hello: "world" }, 200);
  assertEquals(ok.status, 200);
  assertEquals(await ok.json(), { ok: true, data: { hello: "world" } });

  const err = apiErr("something broke", 409);
  assertEquals(err.status, 409);
  assertEquals(await err.json(), { ok: false, error: "something broke" });
});

function fakeCreateClient(behavior: "valid" | "invalid" | "error") {
  return (_url: string, _key: string, _opts: Record<string, unknown>) => ({
    auth: {
      getUser: () => {
        if (behavior === "valid") {
          return Promise.resolve({ data: { user: { id: "real-user-id", email: "real-user@collegeos.test" } }, error: null });
        }
        if (behavior === "invalid") {
          return Promise.resolve({ data: { user: null }, error: { message: "invalid token" } });
        }
        return Promise.reject(new Error("network error"));
      },
    },
  });
}

Deno.test("getVerifiedCaller: missing Authorization header is rejected before any client is constructed", async () => {
  Deno.env.set("SUPABASE_URL", "http://x");
  Deno.env.set("SUPABASE_ANON_KEY", "anon-key");
  const result = await getVerifiedCaller(new Request("http://x", { method: "POST" }), fakeCreateClient("valid"));
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.response.status, 401);
});

Deno.test("getVerifiedCaller: a valid session returns the real user id from auth.getUser, not the header itself", async () => {
  Deno.env.set("SUPABASE_URL", "http://x");
  Deno.env.set("SUPABASE_ANON_KEY", "anon-key");
  const req = new Request("http://x", { method: "POST", headers: { Authorization: "Bearer some-real-jwt" } });
  const result = await getVerifiedCaller(req, fakeCreateClient("valid"));
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.userId, "real-user-id");
    assertEquals(result.email, "real-user@collegeos.test");
  }
});

Deno.test("getVerifiedCaller: an invalid/expired session is rejected with 401, not trusted", async () => {
  Deno.env.set("SUPABASE_URL", "http://x");
  Deno.env.set("SUPABASE_ANON_KEY", "anon-key");
  const req = new Request("http://x", { method: "POST", headers: { Authorization: "Bearer stale-jwt" } });
  const result = await getVerifiedCaller(req, fakeCreateClient("invalid"));
  assertEquals(result.ok, false);
  if (!result.ok) assertEquals(result.response.status, 401);
});
