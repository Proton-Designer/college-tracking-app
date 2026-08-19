import { createClient } from "npm:@supabase/supabase-js@2";
import { assert, assertEquals } from "jsr:@std/assert@1";
import { detectAndStoreCalibrationInsights } from "./insightDetection.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function createThrowawayUser() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const email = `itest-insight-${Date.now()}-${Math.floor(Math.random() * 1e6)}@collegeos.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "itest-insight-password-1", email_confirm: true });
  if (error || !data.user) throw error ?? new Error("admin.createUser returned no user");
  return { admin, userId: data.user.id };
}

// deno-lint-ignore no-explicit-any
async function seedCompletedSession(admin: any, userId: string, category: string, plannedMin: number, actualMin: number, daysAgo: number) {
  const { data: task, error: taskError } = await admin
    .from("tasks")
    .insert({ user_id: userId, title: `itest-insight-${category}-${daysAgo}`, category, estimated_minutes: plannedMin, planned_date: new Date().toISOString().slice(0, 10), status: "completed" })
    .select("id")
    .single();
  if (taskError) throw taskError;

  const createdAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString();
  const { error: sessionError } = await admin.from("task_sessions").insert({
    task_id: task.id,
    user_id: userId,
    status: "completed",
    planned_duration_min: plannedMin,
    actual_duration_min: actualMin,
    planned_start: createdAt,
    actual_start: createdAt,
    created_at: createdAt,
  });
  if (sessionError) throw sessionError;
}

Deno.test("detectAndStoreCalibrationInsights: a user with no session history detects nothing -- 0, not an error", async () => {
  const { admin, userId } = await createThrowawayUser();
  const result = await detectAndStoreCalibrationInsights(admin, userId, "America/New_York", new Date());
  assertEquals(result, []);
});

Deno.test("detectAndStoreCalibrationInsights: a real, consistent underestimate pattern is detected and stored with code-only confidence", async () => {
  const { admin, userId } = await createThrowawayUser();
  // 12 completed sessions in the same category, each running 30% over plan, spread
  // across the lookback window so the split-half check sees the pattern in both halves.
  for (let i = 0; i < 12; i++) {
    await seedCompletedSession(admin, userId, "lab_report", 60, 78, i * 5);
  }

  const result = await detectAndStoreCalibrationInsights(admin, userId, "America/New_York", new Date());
  assertEquals(result.length, 1);
  assertEquals(result[0]!.category, "lab_report");
  assertEquals(result[0]!.confidenceStored, "medium"); // 12 obs: medium, never high below 20

  const { data: row } = await admin.from("insights").select("*").eq("id", result[0]!.insightId).single();
  assertEquals(row.confidence_claimed_by_model, null); // no model ran -- never fake a claim
  assertEquals(row.confidence_stored, "medium");
  assertEquals(row.status, "active");
  assert(row.claim.includes("lab_report"));
  assert(row.claim.includes("short of actual"));
  assertEquals(row.evidence.detectorKey, "calibration:lab_report");
});

Deno.test("detectAndStoreCalibrationInsights: re-running updates the existing insight in place rather than duplicating", async () => {
  const { admin, userId } = await createThrowawayUser();
  for (let i = 0; i < 12; i++) {
    await seedCompletedSession(admin, userId, "coding", 60, 78, i * 5);
  }

  const first = await detectAndStoreCalibrationInsights(admin, userId, "America/New_York", new Date());
  assertEquals(first.length, 1);

  // A stronger pattern emerges with more data -- crossing into high confidence.
  for (let i = 12; i < 25; i++) {
    await seedCompletedSession(admin, userId, "coding", 60, 78, i * 5);
  }
  const second = await detectAndStoreCalibrationInsights(admin, userId, "America/New_York", new Date());
  assertEquals(second.length, 1);
  assertEquals(second[0]!.insightId, first[0]!.insightId); // same row, not a duplicate
  assertEquals(second[0]!.confidenceStored, "high");

  const { data: rows } = await admin.from("insights").select("id").eq("user_id", userId);
  assertEquals(rows!.length, 1);
});
