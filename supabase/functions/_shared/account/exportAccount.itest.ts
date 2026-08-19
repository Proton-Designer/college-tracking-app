// Real-DB proof, using a REAL authenticated (RLS-scoped) client from a real password
// sign-in -- not the service-role admin client -- since the whole point of exportAccount's
// design is that RLS does the user-scoping, not a hand-written filter. If this were tested
// with an admin client, it would prove nothing about the actual security property.

import { createClient } from "npm:@supabase/supabase-js@2";
import { assert, assertEquals } from "jsr:@std/assert@1";
import { exportAccount } from "./exportAccount.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function createThrowawayUserSession(label: string) {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const email = `itest-export-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@collegeos.test`;
  const password = "itest-export-password-1";
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("admin.createUser returned no user");

  const anon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: session, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError || !session.session) throw signInError ?? new Error("sign-in returned no session");

  const authedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${session.session.access_token}` } },
  });

  return { admin, authedClient, userId: data.user.id, email };
}

Deno.test("exportAccount: includes real table rows, the profile, and derived material (insights) -- all via the caller's own RLS-scoped client", async () => {
  const { admin, authedClient, userId } = await createThrowawayUserSession("full");

  const { data: course } = await admin.from("courses").insert({ user_id: userId, code: "TEST 300", name: "Export Fixture", term: "Fall 2026" }).select("id").single();
  await admin.from("insights").insert({ user_id: userId, claim: "Late study sessions run short.", confidence_stored: "testing", sample_size: 4 });
  await admin.rpc("store_oauth_token", { p_user_id: userId, p_provider: "rescuetime", p_token: "should-never-appear-in-export" });

  const result = await exportAccount(authedClient, userId);

  assertEquals(result.userId, userId);
  assert(result.profile !== null);
  assertEquals(result.profile!.id, userId);

  assert(Array.isArray(result.tables.courses));
  assertEquals(result.tables.courses.length, 1);
  assertEquals(result.tables.courses[0].id, course!.id);

  assert(Array.isArray(result.tables.insights));
  assertEquals(result.tables.insights.length, 1);
  assertEquals(result.tables.insights[0].claim, "Late study sessions run short.");

  // The connection's metadata is exported (proves connected accounts show up)...
  assert(Array.isArray(result.tables.oauth_connections));
  assertEquals(result.tables.oauth_connections.length, 1);
  assertEquals(result.tables.oauth_connections[0].provider, "rescuetime");
  // ...but the raw secret value is never anywhere in the export, because the table
  // itself never held it -- only a vault_secret_id pointer.
  const wholeExportText = JSON.stringify(result);
  assertEquals(wholeExportText.includes("should-never-appear-in-export"), false);
});

Deno.test("exportAccount: enumerates a real, substantial set of tables dynamically, not a short hardcoded subset", async () => {
  const { authedClient, userId } = await createThrowawayUserSession("breadth");
  const result = await exportAccount(authedClient, userId);
  // Not asserting an exact count (that would be its own hardcoded list to maintain) --
  // asserting it's clearly the real dynamic enumeration (40+ tables), not a stub.
  assert(Object.keys(result.tables).length >= 35, `expected 35+ tables, got ${Object.keys(result.tables).length}`);
  assert("daily_summaries" in result.tables);
  assert("semester_lessons" in result.tables);
  assert("agent_reports" in result.tables);
});

Deno.test("exportAccount: includes a working signed URL for an uploaded file", async () => {
  const { admin, authedClient, userId } = await createThrowawayUserSession("files");
  const { error: uploadError } = await admin.storage.from("syllabi").upload(`${userId}/syllabus.pdf`, new Blob(["%PDF-fixture"], { type: "application/pdf" }));
  assertEquals(uploadError, null);

  const result = await exportAccount(authedClient, userId);
  assertEquals(result.files.length, 1);
  assertEquals(result.files[0].bucket, "syllabi");
  assertEquals(result.files[0].path, `${userId}/syllabus.pdf`);
  assert(result.files[0].signedUrl !== null);

  const download = await fetch(result.files[0].signedUrl!);
  assertEquals(download.ok, true);
  const text = await download.text();
  assertEquals(text, "%PDF-fixture");
});

Deno.test("exportAccount: never includes another user's rows, relying on RLS alone (no explicit filter in the export code)", async () => {
  const { admin: adminA, authedClient: clientA, userId: userA } = await createThrowawayUserSession("isolation-a");
  const { admin: adminB, userId: userB } = await createThrowawayUserSession("isolation-b");

  await adminA.from("courses").insert({ user_id: userA, code: "MINE 100", name: "User A's course", term: "Fall 2026" });
  await adminB.from("courses").insert({ user_id: userB, code: "THEIRS 100", name: "User B's course", term: "Fall 2026" });

  const result = await exportAccount(clientA, userA);
  assertEquals(result.tables.courses.length, 1);
  assertEquals(result.tables.courses[0].code, "MINE 100");
});

Deno.test("exportAccount: an account with no data yet exports cleanly -- every table an empty array, not an error", async () => {
  const { authedClient, userId } = await createThrowawayUserSession("empty");
  const result = await exportAccount(authedClient, userId);
  assertEquals(result.tables.courses, []);
  assertEquals(result.files, []);
  assert(result.profile !== null); // the profile itself always exists (auto-created on signup)
});
