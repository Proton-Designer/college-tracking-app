// Real-DB, real-Storage-API, real-GoTrue proof for account deletion -- the parts
// 07_account_deletion.test.sql's pgTAP layer cannot reach (Storage has no SQL interface;
// admin.auth.admin.deleteUser is an HTTP call to GoTrue, not a SQL operation). The
// row-cascade proof itself (every one of the 41+1 user-scoped tables reaching zero rows)
// already lives in that pgTAP test and is not duplicated here.
//
// This suite is guarded like nothing else in this codebase: it refuses to run unless
// SUPABASE_URL is a local address, and it refuses to run against demo@collegeos.app as a
// target, enforced in code rather than left to convention -- a delete suite pointed at a
// real project would be unrecoverable, and this is the one place where "trust the test
// setup" is not an acceptable risk.

import { createClient } from "npm:@supabase/supabase-js@2";
import { assert, assertEquals } from "jsr:@std/assert@1";
import { deleteAccount } from "./deleteAccount.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEMO_EMAIL = "demo@collegeos.app";

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(SUPABASE_URL)) {
  throw new Error(
    `deleteAccount.itest.ts refuses to run against a non-local SUPABASE_URL ("${SUPABASE_URL}"). ` +
      `This suite deletes real accounts, real Vault secrets, and real Storage objects -- pointed at a ` +
      `cloud project, it would be unrecoverable. Run it only against the local stack.`,
  );
}

function createThrowawayEmail(): string {
  const email = `itest-account-delete-${Date.now()}-${Math.floor(Math.random() * 1e6)}@collegeos.test`;
  if (email.toLowerCase() === DEMO_EMAIL) throw new Error("unreachable: throwaway email collided with the demo account literal");
  return email;
}

async function createThrowawayUser() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const email = createThrowawayEmail();
  // A throwaway-only invariant, enforced in code -- this suite must never be pointed at
  // the shared demo account, no matter how the email got constructed.
  assert(email.toLowerCase() !== DEMO_EMAIL, "refusing to run account deletion against demo@collegeos.app");
  const { data, error } = await admin.auth.admin.createUser({ email, password: "itest-account-delete-password-1", email_confirm: true });
  if (error || !data.user) throw error ?? new Error("admin.createUser returned no user");
  return { admin, userId: data.user.id, email };
}

Deno.test("deleteAccount: full flow -- deletes the vault secret, the storage object, the account, and reports accurate counts", async () => {
  const { admin, userId, email } = await createThrowawayUser();

  await admin.from("courses").insert({ user_id: userId, code: "TEST 101", name: "Deletion Fixture", term: "Fall 2026" });
  await admin.rpc("store_oauth_token", { p_user_id: userId, p_provider: "rescuetime", p_token: "fixture-key-to-delete" });
  const { error: uploadError } = await admin.storage.from("syllabi").upload(`${userId}/syllabus.pdf`, new Blob(["%PDF-fixture"], { type: "application/pdf" }));
  assertEquals(uploadError, null);

  const result = await deleteAccount(admin, admin, userId, email, email);
  assertEquals(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assertEquals(result.report, {
    vaultSecretsDeleted: 1,
    storageObjectsDeleted: { syllabi: 1, proof: 0, avatars: 0 },
    accountDeleted: true,
  });

  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  assertEquals(authUser.user, null);

  const { data: coursesAfter } = await admin.from("courses").select("id").eq("user_id", userId);
  assertEquals(coursesAfter!.length, 0);

  const { data: syllabiAfter } = await admin.storage.from("syllabi").list(userId);
  assertEquals((syllabiAfter ?? []).length, 0);
});

Deno.test("deleteAccount: an empty account (no vault secret, no storage objects) still deletes cleanly", async () => {
  const { admin, userId, email } = await createThrowawayUser();
  const result = await deleteAccount(admin, admin, userId, email, email);
  assertEquals(result.ok, true);
  if (!result.ok) throw new Error("unreachable");
  assertEquals(result.report, { vaultSecretsDeleted: 0, storageObjectsDeleted: { syllabi: 0, proof: 0, avatars: 0 }, accountDeleted: true });
});

Deno.test("deleteAccount: a mismatched confirmation email refuses BEFORE touching anything -- vault secret, storage object, and account all survive", async () => {
  const { admin, userId, email } = await createThrowawayUser();
  await admin.rpc("store_oauth_token", { p_user_id: userId, p_provider: "rescuetime", p_token: "fixture-key-untouched" });
  await admin.storage.from("syllabi").upload(`${userId}/syllabus.pdf`, new Blob(["%PDF-fixture"], { type: "application/pdf" }));

  const result = await deleteAccount(admin, admin, userId, email, "someone-else@collegeos.test");
  assertEquals(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assertEquals(result.reason, "email_mismatch");

  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  assert(authUser.user !== null, "account must still exist after a refused confirmation");

  const { data: connections } = await admin.from("oauth_connections").select("id").eq("user_id", userId);
  assertEquals(connections!.length, 1, "vault-backed connection must survive a refused confirmation");

  const { data: syllabi } = await admin.storage.from("syllabi").list(userId);
  assertEquals((syllabi ?? []).length, 1, "storage object must survive a refused confirmation");
});

Deno.test("deleteAccount: a missing confirmation email (empty string) refuses the same way a mismatch does", async () => {
  const { admin, userId, email } = await createThrowawayUser();
  const result = await deleteAccount(admin, admin, userId, email, "");
  assertEquals(result.ok, false);
  if (result.ok) throw new Error("unreachable");
  assertEquals(result.reason, "email_mismatch");

  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  assert(authUser.user !== null);
});

Deno.test("deleteAccount: confirmation email comparison is case-insensitive (a real user typing their own email shouldn't be refused over casing)", async () => {
  const { admin, userId, email } = await createThrowawayUser();
  const result = await deleteAccount(admin, admin, userId, email, email.toUpperCase());
  assertEquals(result.ok, true);
});

Deno.test("deleteAccount: only deletes storage objects under the calling user's own prefix, never another user's", async () => {
  const { admin, userId, email } = await createThrowawayUser();
  const { admin: admin2, userId: otherUserId } = await createThrowawayUser();

  await admin.storage.from("syllabi").upload(`${userId}/mine.pdf`, new Blob(["%PDF-fixture"], { type: "application/pdf" }));
  await admin2.storage.from("syllabi").upload(`${otherUserId}/theirs.pdf`, new Blob(["%PDF-fixture"], { type: "application/pdf" }));

  await deleteAccount(admin, admin, userId, email, email);

  const { data: otherStillThere } = await admin.storage.from("syllabi").list(otherUserId);
  assertEquals((otherStillThere ?? []).length, 1, "another user's storage object must be untouched by this deletion");
});
