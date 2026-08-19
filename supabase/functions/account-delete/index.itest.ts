// Live, end-to-end HTTP proof of the account-delete authorization boundary -- a real
// deployed function, a real JWT from a real sign-in, a real network call. The unit-level
// proof in deleteAccount.itest.ts already shows the request schema has no user_id field
// and userId comes only from getVerifiedCaller; that's a structural guarantee, correct
// today. This test exists for the day a refactor quietly breaks that structure: it's the
// one operation in this product with no undo, so the extra twenty minutes buys real
// insurance against an unrecoverable mistake, not just today's correctness.
//
// Same local-only guard as deleteAccount.itest.ts -- this suite deletes real accounts
// against the real deployed function.

import { createClient } from "npm:@supabase/supabase-js@2";
import { assert, assertEquals } from "jsr:@std/assert@1";

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEMO_EMAIL = "demo@collegeos.app";
const ACCOUNT_DELETE_URL = `${SUPABASE_URL}/functions/v1/account-delete`;

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(SUPABASE_URL)) {
  throw new Error(`account-delete/index.itest.ts refuses to run against a non-local SUPABASE_URL ("${SUPABASE_URL}") -- this suite calls the real deployed delete function.`);
}

async function createThrowawayUserWithSession(label: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const email = `itest-account-delete-http-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@collegeos.test`;
  assert(email.toLowerCase() !== DEMO_EMAIL, "refusing to run against demo@collegeos.app");
  const password = "itest-account-delete-http-password-1";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("admin.createUser returned no user");

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: session, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError || !session.session) throw signInError ?? new Error("sign-in returned no session");

  await admin.from("courses").insert({ user_id: data.user.id, code: "TEST 200", name: "Cross-user delete fixture", term: "Fall 2026" });

  return { admin, userId: data.user.id, email, accessToken: session.session.access_token };
}

async function assertUserFullyIntact(admin: AnySupabaseClient, userId: string) {
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  assert(authUser.user !== null, "account must still exist");
  const { data: courses } = await admin.from("courses").select("id").eq("user_id", userId);
  assertEquals(courses!.length, 1, "the user's data must be completely untouched");
}

Deno.test("account-delete (live HTTP): a request whose body smuggles another user's id has zero effect -- only the JWT holder's own account is ever touched", async () => {
  const userA = await createThrowawayUserWithSession("victim");
  const userB = await createThrowawayUserWithSession("attacker");

  // User B's real JWT, a well-formed request that would succeed for B's own account, but
  // with an extraneous field that (if the handler ever read it instead of the verified
  // session) would redirect the deletion at user A.
  const response = await fetch(ACCOUNT_DELETE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${userB.accessToken}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ confirmEmail: userB.email, userId: userA.userId, targetUserId: userA.userId, user_id: userA.userId }),
  });
  const body = await response.json();

  assertEquals(response.status, 200, `expected the request to succeed against B's OWN account: ${JSON.stringify(body)}`);
  assertEquals(body.data.accountDeleted, true);

  // B is genuinely gone -- the call did something real, not a silent no-op.
  const { data: bAfter } = await userA.admin.auth.admin.getUserById(userB.userId);
  assertEquals(bAfter.user, null, "user B's own account should be deleted");

  // A is completely unaffected by B's request, despite A's id appearing three different
  // ways in the request body.
  await assertUserFullyIntact(userA.admin, userA.userId);
});

Deno.test("account-delete (live HTTP): confirming with someone else's email is refused, and BOTH accounts survive completely intact", async () => {
  const userA = await createThrowawayUserWithSession("victim2");
  const userB = await createThrowawayUserWithSession("attacker2");

  const response = await fetch(ACCOUNT_DELETE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${userB.accessToken}`, apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ confirmEmail: userA.email }), // B's session, but A's email as "confirmation"
  });
  const body = await response.json();

  assertEquals(response.status, 400, `expected a refusal: ${JSON.stringify(body)}`);
  assertEquals(body.ok, false);

  await assertUserFullyIntact(userA.admin, userA.userId);
  await assertUserFullyIntact(userA.admin, userB.userId); // B also untouched -- the refusal didn't partially delete B either
});

Deno.test("account-delete (live HTTP): an unauthenticated request is rejected before any data is touched", async () => {
  const userA = await createThrowawayUserWithSession("victim3");

  const response = await fetch(ACCOUNT_DELETE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ confirmEmail: userA.email }),
  });

  assertEquals(response.status, 401);
  await assertUserFullyIntact(userA.admin, userA.userId);
});
