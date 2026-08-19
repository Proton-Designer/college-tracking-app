// Real-DB proof for loadDurableProfile's dedupe: a lesson re-promoted by multiple
// semester-retrospective runs must appear exactly once in the durable profile, with an
// explicit confirmationCount -- never once per run. Repetition in a cached prompt reads
// as emphasis the model can't distinguish from genuinely stronger evidence, so silently
// sending the same lesson N times would be a real, permanent bias in every future
// nightly call. See migration 00000000000015 and buildContext.ts's own comments.

import { createClient } from "npm:@supabase/supabase-js@2";
import { assert, assertEquals } from "jsr:@std/assert@1";
import { loadDurableProfile } from "./buildContext.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function createThrowawayUser() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const email = `itest-durableprofile-${Date.now()}-${Math.floor(Math.random() * 1e6)}@collegeos.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "itest-durableprofile-password-1", email_confirm: true });
  if (error || !data.user) throw error ?? new Error("admin.createUser returned no user");
  return { admin, userId: data.user.id };
}

Deno.test("loadDurableProfile: a lesson re-confirmed across three retrospective runs appears once, with confirmationCount 3", async () => {
  const { admin, userId } = await createThrowawayUser();

  const { data: insight, error: insightError } = await admin
    .from("insights")
    .insert({ user_id: userId, claim: "Distraction spikes after lecture transitions.", confidence_stored: "high", sample_size: 22, status: "active" })
    .select("id")
    .single();
  assertEquals(insightError, null);

  // Three separate retrospective runs independently re-promoted the same insight --
  // three real append-only rows, oldest to newest.
  for (const term of ["Fall 2025", "Spring 2026", "Summer 2026"]) {
    const { error } = await admin
      .from("semester_lessons")
      .insert({ user_id: userId, term, lesson: `Distraction spikes after lecture transitions (as of ${term}).`, confidence: "high", source_insight_id: insight!.id });
    assertEquals(error, null);
  }

  // An unrelated, manually-written lesson with no source -- must pass through
  // untouched, not folded into the count above.
  const { error: manualError } = await admin
    .from("semester_lessons")
    .insert({ user_id: userId, term: "Spring 2026", lesson: "Hand-written note with no source insight.", confidence: "medium" });
  assertEquals(manualError, null);

  const profile = await loadDurableProfile(admin, userId);

  const promoted = profile.durableLessons.filter((l) => l.sourceInsightId === insight!.id);
  assertEquals(promoted.length, 1); // exactly once, not three times
  assertEquals(promoted[0]!.confirmationCount, 3);
  assert(promoted[0]!.lesson.includes("Summer 2026")); // the most recent row's text wins

  const manual = profile.durableLessons.find((l) => l.sourceInsightId === null);
  assert(manual);
  assertEquals(manual!.confirmationCount, 1);

  assertEquals(profile.durableLessons.length, 2); // 1 promoted (deduped from 3) + 1 manual
});
