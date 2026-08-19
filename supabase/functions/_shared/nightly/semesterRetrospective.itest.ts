import { createClient } from "npm:@supabase/supabase-js@2";
import { assert, assertEquals } from "jsr:@std/assert@1";
import { runSemesterRetrospective } from "./semesterRetrospective.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const HIGH_CONFIDENCE_EVIDENCE = {
  sampleSize: 25,
  effectHoldsInBothHalves: true,
  effectSize: 0.6,
  noiseFloor: 0.15,
  consistentDirection: true,
};
const MEDIUM_CONFIDENCE_EVIDENCE = { sampleSize: 12, effectHoldsInBothHalves: true, effectSize: 0.1, noiseFloor: 0.15, consistentDirection: true };

async function createThrowawayUser() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const email = `itest-retro-${Date.now()}-${Math.floor(Math.random() * 1e6)}@collegeos.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "itest-retro-password-1", email_confirm: true });
  if (error || !data.user) throw error ?? new Error("admin.createUser returned no user");
  return { admin, userId: data.user.id };
}

// deno-lint-ignore no-explicit-any
async function insertInsight(
  admin: any,
  userId: string,
  overrides: { claim: string; evidence: unknown; confidenceStored: string; createdAt?: Date },
) {
  const { data, error } = await admin
    .from("insights")
    .insert({
      user_id: userId,
      claim: overrides.claim,
      evidence: overrides.evidence,
      confidence_stored: overrides.confidenceStored,
      sample_size: 1,
      status: "active",
      ...(overrides.createdAt ? { created_at: overrides.createdAt.toISOString() } : {}),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data!.id as number;
}

Deno.test("runSemesterRetrospective: promotes only insights that independently re-gate to high, even if a stale stored tier claims otherwise", async () => {
  const { admin, userId } = await createThrowawayUser();

  const highId = await insertInsight(admin, userId, { claim: "Reading tasks consistently run 40% over estimate.", evidence: HIGH_CONFIDENCE_EVIDENCE, confidenceStored: "high" });
  // Stored tier says 'high', but the actual evidence only supports 'medium' -- proves
  // re-gating, not trusting the column, is what actually happens.
  const staleHighId = await insertInsight(admin, userId, { claim: "Coding tasks run long on Fridays.", evidence: MEDIUM_CONFIDENCE_EVIDENCE, confidenceStored: "high" });
  const legacyId = await insertInsight(admin, userId, { claim: "Legacy seed-style insight with no structured evidence.", evidence: { observedRatio: 1.28 }, confidenceStored: "medium" });

  const result = await runSemesterRetrospective(admin, userId, "Fall 2026", new Date());

  assertEquals(result.promotedLessons.length, 1);
  assertEquals(result.promotedLessons[0]!.insightId, highId);
  assertEquals(result.promotedLessons[0]!.confidence, "high");
  assert(!result.promotedLessons.some((p) => p.insightId === staleHighId));
  assert(!result.promotedLessons.some((p) => p.insightId === legacyId));

  const { data: lessonRow } = await admin.from("semester_lessons").select("*").eq("source_insight_id", highId).single();
  assertEquals(lessonRow!.lesson, "Reading tasks consistently run 40% over estimate.");
  assertEquals(lessonRow!.confidence, "high");
});

Deno.test("runSemesterRetrospective: re-running promotes the same insight again -- append-only, a genuine re-confirmation, not a duplicate error", async () => {
  const { admin, userId } = await createThrowawayUser();
  const highId = await insertInsight(admin, userId, { claim: "Consistent pattern across the whole term.", evidence: HIGH_CONFIDENCE_EVIDENCE, confidenceStored: "high" });

  const first = await runSemesterRetrospective(admin, userId, "Fall 2026", new Date());
  assertEquals(first.promotedLessons.length, 1);
  const second = await runSemesterRetrospective(admin, userId, "Fall 2026", new Date());
  assertEquals(second.promotedLessons.length, 1);
  assert(second.promotedLessons[0]!.lessonId !== first.promotedLessons[0]!.lessonId); // a new row, not an update

  const { data: rows } = await admin.from("semester_lessons").select("id").eq("source_insight_id", highId);
  assertEquals(rows!.length, 2);
});

Deno.test("runSemesterRetrospective: self-audit flags an insight >= 30 days old with no experiment ever created from it", async () => {
  const { admin, userId } = await createThrowawayUser();
  const thirtyFiveDaysAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
  const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

  const staleId = await insertInsight(admin, userId, { claim: "Old, never tested.", evidence: MEDIUM_CONFIDENCE_EVIDENCE, confidenceStored: "medium", createdAt: thirtyFiveDaysAgo });
  const recentId = await insertInsight(admin, userId, { claim: "Too new to flag yet.", evidence: MEDIUM_CONFIDENCE_EVIDENCE, confidenceStored: "medium", createdAt: fiveDaysAgo });
  const testedId = await insertInsight(admin, userId, { claim: "Old, but actually tested.", evidence: MEDIUM_CONFIDENCE_EVIDENCE, confidenceStored: "medium", createdAt: thirtyFiveDaysAgo });
  const { error: experimentError } = await admin.from("experiments").insert({ user_id: userId, insight_id: testedId, hypothesis: "A real trial ran against this.", start_date: "2026-07-01", status: "running" });
  assertEquals(experimentError, null);

  const result = await runSemesterRetrospective(admin, userId, "Fall 2026", new Date());

  const flaggedIds = result.staleUnactionedInsights.map((s) => s.insightId);
  assert(flaggedIds.includes(staleId));
  assert(!flaggedIds.includes(recentId)); // too recent, even though never tested
  assert(!flaggedIds.includes(testedId)); // old, but an experiment WAS created -- not idle

  const staleEntry = result.staleUnactionedInsights.find((s) => s.insightId === staleId);
  assert(staleEntry!.daysSinceCreated >= 30);
});
