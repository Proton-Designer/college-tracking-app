// Real integration proof for L7's model-path requirement: golden-fixture tests proving
// malformed/budget-breached responses land on the deterministic report, a dedicated
// "model entirely absent" completeness test (the actual state of tonight -- no
// ANTHROPIC_API_KEY exists anywhere in this environment), and a privacy assertion.
//
// Runs against the real local Supabase stack (service-role client) with a dedicated
// throwaway user per run -- "reads against demo, writes against a throwaway" applies
// here too: this writes real daily_summaries/agent_reports/llm_usage_log rows.
//
// The LLM provider is always the fixture (createFixtureProvider) -- no network call to
// Anthropic is ever made here, matching every other LLM-layer test in this codebase
// (docs/LLM_LAYER_SPEC.md §10: the deterministic path is what tonight can actually prove).

import { createClient } from "npm:@supabase/supabase-js@2";
import { assert, assertEquals, assertExists } from "jsr:@std/assert@1";
import { runNightlyAnalysisForUser } from "./runNightlyAnalysis.ts";
import { createFixtureProvider } from "../llm/__fixtures__/fixtureProvider.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VALID_ANALYSIS = {
  headline: "Steady day, one real slip.",
  objective_summary: "1 of 1 MIT completed; no deep-work sessions logged.",
  wins: [{ claim: "Completed the day's only MIT.", evidence: ["mitsCompleted: 1"], confidence: 0.9 }],
  failures: [],
  planning_errors: [],
  behavior_patterns: [],
  academic_risks: [],
  tomorrow_changes: [{ description: "Log a focus session tomorrow.", rationale: "No session data limits what tomorrow's report can assess." }],
  kill_list_intervention: null,
  data_gaps: [],
};

async function createThrowawayUser() {
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const email = `itest-nightly-${Date.now()}-${Math.floor(Math.random() * 1e6)}@collegeos.test`;
  const { data, error } = await admin.auth.admin.createUser({ email, password: "itest-nightly-password-1", email_confirm: true });
  if (error || !data.user) throw error ?? new Error("admin.createUser returned no user");
  return { admin, userId: data.user.id };
}

const LOCAL_DATE = "2026-08-18";

Deno.test("runNightlyAnalysisForUser: model entirely absent -- the deterministic report is complete and useful on its own", async () => {
  const { admin, userId } = await createThrowawayUser();

  const outcome = await runNightlyAnalysisForUser(
    { client: admin, provider: null, model: "claude-sonnet-5", maxTokens: 2000, now: () => new Date("2026-08-19T05:00:00Z") },
    userId,
    LOCAL_DATE,
  );

  assertEquals(outcome.usedModel, false);
  // The honesty requirement: this environment truly has no model tonight, so the stored
  // model must say so -- never fake a model name that never ran (the pre-existing
  // seed.sql placeholder row does exactly that; this pipeline must not repeat it).
  assertEquals(outcome.model, "deterministic");

  const { data: row, error } = await admin.from("agent_reports").select("*").eq("id", outcome.reportId).single();
  assertEquals(error, null);
  assertEquals(row.model, "deterministic");
  assertEquals(row.report_type, "nightly");
  assertExists(row.payload.deterministic);
  assertEquals(row.payload.analysis, null);
  assert(row.payload.note.includes("No ANTHROPIC_API_KEY"));

  // The actual completeness bar: a real user with zero data for the day still gets a
  // deterministic report with a real, typed shape and honest data_gaps -- not an
  // exception, not a hollow object.
  const det = row.payload.deterministic;
  assertEquals(det.localDate, LOCAL_DATE);
  assert(Array.isArray(det.dataGaps));
  assert(det.dataGaps.length > 0); // this throwaway user genuinely has no check-in/review/sessions today
  assertExists(det.recoveryMode);
  assertExists(det.riskAssessment);
  assertExists(det.focusSessions);
  assertEquals(det.focusSessions.count, 0);

  // Also proves storeDailySummary ran -- the pyramid's daily tier exists independent of
  // whether the model layer ever runs.
  const { data: summaryRow } = await admin.from("daily_summaries").select("*").eq("user_id", userId).eq("local_date", LOCAL_DATE).single();
  assertExists(summaryRow);
  assertEquals(summaryRow.summary.dataGapCount, det.dataGaps.length);
});

Deno.test("runNightlyAnalysisForUser: a malformed/schema-invalid model response falls back to the deterministic report, never a broken one", async () => {
  const { admin, userId } = await createThrowawayUser();

  // Missing required fields (headline, wins, etc.) -- the gateway's Zod gate must reject
  // this, retry once, and still reject, landing on deterministicFallback.
  const provider = createFixtureProvider([
    { kind: "success", toolInput: { headline: "truncated" } },
    { kind: "success", toolInput: { headline: "still truncated" } },
  ]);

  const outcome = await runNightlyAnalysisForUser(
    { client: admin, provider, model: "claude-sonnet-5", maxTokens: 2000, now: () => new Date("2026-08-19T05:00:00Z") },
    userId,
    LOCAL_DATE,
  );

  assertEquals(outcome.usedModel, false);
  assertEquals(outcome.model, "deterministic");
  assertEquals(provider.callCount(), 2); // one real attempt + the gateway's one retry, per its own MAX_ATTEMPTS

  const { data: row } = await admin.from("agent_reports").select("*").eq("id", outcome.reportId).single();
  assertEquals(row.model, "deterministic");
  assertEquals(row.payload.analysis, null);
  assert(row.payload.note.includes("schema_validation_failed"));
  assertExists(row.payload.deterministic.riskAssessment); // the report itself is still whole
});

Deno.test("runNightlyAnalysisForUser: a budget breach never even attempts the network call, and still stores a real report", async () => {
  const { admin, userId } = await createThrowawayUser();
  const { error: budgetError } = await admin.from("profiles").update({ llm_monthly_budget_usd: 0.01 }).eq("id", userId);
  assertEquals(budgetError, null);

  const provider = createFixtureProvider([{ kind: "success", toolInput: VALID_ANALYSIS }]);

  const outcome = await runNightlyAnalysisForUser(
    { client: admin, provider, model: "claude-sonnet-5", maxTokens: 2000, now: () => new Date("2026-08-19T05:00:00Z") },
    userId,
    LOCAL_DATE,
  );

  assertEquals(outcome.usedModel, false);
  assertEquals(provider.callCount(), 0); // deterministic-first gate: no call made once the ceiling would be crossed
  const { data: row } = await admin.from("agent_reports").select("*").eq("id", outcome.reportId).single();
  assertEquals(row.model, "deterministic");
  assert(row.payload.note.includes("budget"));
});

Deno.test("runNightlyAnalysisForUser: a valid model response is stored honestly under the real model name, and re-running the same night replaces rather than duplicates", async () => {
  const { admin, userId } = await createThrowawayUser();
  const provider = createFixtureProvider([{ kind: "success", toolInput: VALID_ANALYSIS }]);

  const deps = { client: admin, provider, model: "claude-sonnet-5" as const, maxTokens: 2000, now: () => new Date("2026-08-19T05:00:00Z") };
  const first = await runNightlyAnalysisForUser(deps, userId, LOCAL_DATE);
  assertEquals(first.usedModel, true);
  assertEquals(first.model, "claude-sonnet-5");

  const { data: rowAfterFirst } = await admin.from("agent_reports").select("id, payload").eq("user_id", userId).eq("report_type", "nightly").eq("local_date", LOCAL_DATE);
  assertEquals(rowAfterFirst!.length, 1);
  assertEquals(rowAfterFirst![0]!.payload.analysis.headline, VALID_ANALYSIS.headline);

  const second = await runNightlyAnalysisForUser(deps, userId, LOCAL_DATE);
  assertEquals(second.reportId, first.reportId); // same row, updated in place -- not a duplicate
  const { data: rowsAfterSecond } = await admin.from("agent_reports").select("id").eq("user_id", userId).eq("report_type", "nightly").eq("local_date", LOCAL_DATE);
  assertEquals(rowsAfterSecond!.length, 1);
});

Deno.test("privacy: journal-adjacent text never reaches llm_usage_log -- only counts and a content hash", async () => {
  const { admin, userId } = await createThrowawayUser();
  const secretReviewText = "SECRET-JOURNAL-CONTENT-do-not-leak-8f2a91";

  const { error: reviewError } = await admin.from("daily_reviews").insert({
    user_id: userId,
    local_date: LOCAL_DATE,
    mits_planned: 0,
    mits_completed: 0,
    went_wrong_text: secretReviewText,
  });
  assertEquals(reviewError, null);

  const provider = createFixtureProvider([{ kind: "success", toolInput: VALID_ANALYSIS }]);
  await runNightlyAnalysisForUser(
    { client: admin, provider, model: "claude-sonnet-5", maxTokens: 2000, now: () => new Date("2026-08-19T05:00:00Z") },
    userId,
    LOCAL_DATE,
  );

  const { data: usageRows, error } = await admin.from("llm_usage_log").select("*").eq("user_id", userId);
  assertEquals(error, null);
  assertEquals(usageRows!.length, 1);
  const row = usageRows![0]!;

  // Structural guarantee, not just a substring check: the row has no free-text column
  // at all to leak into -- only counts, cost, latency, and a hash.
  const keys = Object.keys(row).sort();
  assertEquals(keys, ["cache_read_tokens", "cache_write_tokens", "call_type", "content_hash", "cost_usd", "created_at", "id", "input_tokens", "latency_ms", "model", "output_tokens", "success", "user_id"]);
  assert(!JSON.stringify(row).includes(secretReviewText));
});
