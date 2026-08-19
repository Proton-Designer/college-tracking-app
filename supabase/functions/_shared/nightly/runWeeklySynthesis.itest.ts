// Real integration proof for the weekly-synthesis pipeline, mirroring
// runNightlyAnalysis.itest.ts's coverage. Privacy is not re-tested here -- weekly
// synthesis logs through the exact same logUsage()/llm_usage_log path nightly does,
// already proven structurally free of any text column there; re-asserting it here would
// prove the same fact about the same table again, not a new one.

import { createClient } from "npm:@supabase/supabase-js@2";
import { assert, assertEquals, assertExists } from "jsr:@std/assert@1";
import { runWeeklySynthesisForUser } from "./runWeeklySynthesis.ts";
import { createFixtureProvider } from "../llm/__fixtures__/fixtureProvider.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VALID_WEEKLY_ANALYSIS = {
  headline: "A week of real progress with one system that isn't earning its keep.",
  objective_summary: "5 of 7 daily reviews logged; deep work trended up mid-week.",
  plan_accuracy_note: "Consistently overplanned deep-work blocks by roughly 20%.",
  academic_note: "No course showed a meaningful risk change this week.",
  behavior_note: "Friction clustered after long lecture blocks.",
  health_note: "Not enough health data logged this week to assess a relationship with execution.",
  system_failure: [{ claim: "The evening check-in's mood question has produced no actionable pattern in 3 weeks.", evidence: ["mood logged 5/7 days, no correlation surfaced with any other metric"], confidence: 0.6 }],
  proposed_experiment: { hypothesis: "A 90-minute deep-work cap will reduce overplanning.", protocol: "Cap every planned deep-work block at 90 minutes for 7 days.", rationale: "Matches this week's actual completion pattern." },
  data_gaps: [],
};

async function createThrowawayUser() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const email = `itest-weekly-${Date.now()}-${Math.floor(Math.random() * 1e6)}@collegeos.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "itest-weekly-password-1", email_confirm: true });
  if (error || !data.user) throw error ?? new Error("admin.createUser returned no user");
  return { admin, userId: data.user.id };
}

const WEEK_END_DATE = "2026-08-18";

Deno.test("runWeeklySynthesisForUser: model entirely absent -- a real user with zero logged days still gets a complete, honest synthesis", async () => {
  const { admin, userId } = await createThrowawayUser();

  const outcome = await runWeeklySynthesisForUser(
    { client: admin, provider: null, model: "claude-sonnet-5", maxTokens: 3000, now: () => new Date("2026-08-19T05:00:00Z") },
    userId,
    WEEK_END_DATE,
  );

  assertEquals(outcome.usedModel, false);
  assertEquals(outcome.model, "deterministic");
  assertEquals(outcome.weekStartDate, "2026-08-12");

  const { data: row } = await admin.from("agent_reports").select("*").eq("id", outcome.reportId).single();
  assertEquals(row.model, "deterministic");
  assertEquals(row.report_type, "weekly");
  assertEquals(row.local_date, "2026-08-12");
  assert(row.payload.note.includes("No ANTHROPIC_API_KEY"));
  assertEquals(row.payload.analysis, null);

  const det = row.payload.deterministic;
  assertEquals(det.daysWithData, 0);
  assertEquals(det.systemFailureSignals.daysWithNoReview, 0); // no days at all, not "7 empty reviews"
  assertEquals(det.experiment, null); // the deterministic pass never invents one

  const { data: weeklyRow } = await admin.from("weekly_summaries").select("*").eq("user_id", userId).eq("week_start_date", "2026-08-12").single();
  assertExists(weeklyRow);
  assertEquals(weeklyRow.summary.daysWithData, 0);
});

Deno.test("runWeeklySynthesisForUser: a real week of daily summaries rolls up correctly, and a valid model response stores under its real name", async () => {
  const { admin, userId } = await createThrowawayUser();

  const dailyRows = [
    { local_date: "2026-08-13", summary: { mitsPlanned: 3, mitsCompleted: 2, deepWorkActualMin: 90, recoveryModeTriggered: false, killListRelapses: 0, killListResisted: 1, frictionCauses: ["fatigue"], dataGapCount: 0 } },
    { local_date: "2026-08-14", summary: { mitsPlanned: 2, mitsCompleted: 2, deepWorkActualMin: 120, recoveryModeTriggered: true, killListRelapses: 1, killListResisted: 0, frictionCauses: ["fatigue"], dataGapCount: 1 } },
  ];
  for (const row of dailyRows) {
    const { error } = await admin.from("daily_summaries").insert({ user_id: userId, local_date: row.local_date, summary: row.summary });
    assertEquals(error, null);
  }

  const provider = createFixtureProvider([{ kind: "success", toolInput: VALID_WEEKLY_ANALYSIS }]);
  const outcome = await runWeeklySynthesisForUser(
    { client: admin, provider, model: "claude-sonnet-5", maxTokens: 3000, now: () => new Date("2026-08-19T05:00:00Z") },
    userId,
    WEEK_END_DATE,
  );

  assertEquals(outcome.usedModel, true);
  assertEquals(outcome.model, "claude-sonnet-5");

  const { data: row } = await admin.from("agent_reports").select("*").eq("id", outcome.reportId).single();
  assertEquals(row.model, "claude-sonnet-5");
  assertEquals(row.payload.analysis.headline, VALID_WEEKLY_ANALYSIS.headline);

  const det = row.payload.deterministic;
  assertEquals(det.daysWithData, 2);
  assertEquals(det.outcomes.totalMitsCompleted, 4);
  assertEquals(det.outcomes.totalDeepWorkActualMin, 210);
  assertEquals(det.outcomes.recoveryModeDays, 1);
  assertEquals(det.killList, { totalRelapses: 1, totalResisted: 1 });
  assertEquals(det.behavior.frictionCauseCounts, { fatigue: 2 });
});

Deno.test("runWeeklySynthesisForUser: a malformed model response falls back to the deterministic synthesis", async () => {
  const { admin, userId } = await createThrowawayUser();
  const provider = createFixtureProvider([
    { kind: "success", toolInput: { headline: "incomplete" } },
    { kind: "success", toolInput: { headline: "still incomplete" } },
  ]);

  const outcome = await runWeeklySynthesisForUser(
    { client: admin, provider, model: "claude-sonnet-5", maxTokens: 3000, now: () => new Date("2026-08-19T05:00:00Z") },
    userId,
    WEEK_END_DATE,
  );

  assertEquals(outcome.usedModel, false);
  assertEquals(provider.callCount(), 2);
  const { data: row } = await admin.from("agent_reports").select("*").eq("id", outcome.reportId).single();
  assertEquals(row.model, "deterministic");
  assert(row.payload.note.includes("schema_validation_failed"));
});

Deno.test("runWeeklySynthesisForUser: a budget breach makes zero network calls and still stores a real synthesis", async () => {
  const { admin, userId } = await createThrowawayUser();
  await admin.from("profiles").update({ llm_monthly_budget_usd: 0.01 }).eq("id", userId);
  const provider = createFixtureProvider([{ kind: "success", toolInput: VALID_WEEKLY_ANALYSIS }]);

  const outcome = await runWeeklySynthesisForUser(
    { client: admin, provider, model: "claude-sonnet-5", maxTokens: 3000, now: () => new Date("2026-08-19T05:00:00Z") },
    userId,
    WEEK_END_DATE,
  );

  assertEquals(outcome.usedModel, false);
  assertEquals(provider.callCount(), 0);
  const { data: row } = await admin.from("agent_reports").select("*").eq("id", outcome.reportId).single();
  assert(row.payload.note.includes("budget"));
});
