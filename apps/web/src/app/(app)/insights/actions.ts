"use server";

import { revalidatePath } from "next/cache";
import {
  createExperiment,
  getUserLocalToday,
  getOwnProfile,
  logDecision,
  logExperimentMeasurement,
  scoreDecision,
  scoreExperiment,
} from "@collegeos/api";
import { addDays } from "@collegeos/core";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface RunExperimentInput {
  insightId: number;
  hypothesis: string;
  protocol?: string;
  durationDays: number;
  /** U9: what this trial measures, what it was before, and which way it should move.
   *  All three are required for a real verdict — `getExperimentOutcome` returns null
   *  without baseline and direction, and without a metric it cannot tell this trial's
   *  readings apart from any other. A trial created without them is unscoreable by
   *  construction, which is exactly the state every pre-U9 experiment is stuck in. */
  metricName: string;
  baselineValue: number;
  hypothesizedDirection: "increase" | "decrease";
}

export interface RunExperimentResult {
  ok: boolean;
  error?: string;
}

/** "Testing" tier's one action -- SCREEN_SPEC §7: convert an observation into an N-of-1
 *  trial with defined measures (folded into `protocol`, the schema's free-text methodology
 *  field -- there's no separate structured "measures" column) and a duration. Always
 *  starts today; the trial's own elapsed-days display is what makes the duration real. */
export async function runExperiment(input: RunExperimentInput): Promise<RunExperimentResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };

  const today = getUserLocalToday(profileResult.data.timezone, new Date());

  const metricName = input.metricName.trim();
  if (!metricName) return { ok: false, error: "Name what this trial measures." };
  if (!Number.isFinite(input.baselineValue)) {
    return { ok: false, error: "Enter the measure's current value, so movement has something to move from." };
  }

  const result = await createExperiment(client, user.id, {
    insightId: input.insightId,
    hypothesis: input.hypothesis,
    startDate: today,
    endDate: addDays(today, input.durationDays),
    metricName,
    baselineValue: input.baselineValue,
    hypothesizedDirection: input.hypothesizedDirection,
    ...(input.protocol ? { protocol: input.protocol } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };

  revalidatePath("/insights");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// U9 — closing the experiment loop.
//
// Before this, `createExperiment` was the only reachable write: a user could START a
// trial and then had no way to record a single reading or score it. `logExperimentMeasurement`,
// `scoreExperiment` and `getExperimentOutcome` all existed, fully tested, with zero callers
// on either platform — so the Learn step of the closed loop dead-ended, and the demo
// account sat on "Day 8 of 7 · no measurements logged yet" forever.
// ---------------------------------------------------------------------------

export interface LogMeasurementInput {
  experimentId: number;
  metric: string;
  value: number;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** One reading for a running trial. The date is always the user's own local today —
 *  never `new Date().toISOString()`, which is a UTC date and would file an evening
 *  reading under tomorrow for anyone east of UTC and under yesterday for anyone west
 *  of it (B4). */
export async function logMeasurement(input: LogMeasurementInput): Promise<ActionResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const metric = input.metric.trim();
  if (!metric) return { ok: false, error: "Name the measure you're recording." };
  if (!Number.isFinite(input.value)) return { ok: false, error: "Enter a number." };

  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const today = getUserLocalToday(profileResult.data.timezone, new Date());

  const result = await logExperimentMeasurement(client, user.id, {
    experimentId: input.experimentId,
    metric,
    value: input.value,
    localDate: today,
  });
  if (!result.ok) return { ok: false, error: result.error.message };

  revalidatePath("/insights");
  return { ok: true };
}

export interface CloseExperimentInput {
  experimentId: number;
  status: "completed" | "abandoned";
  outcomeSummary: string;
}

/** Closes a trial. The deterministic verdict is computed separately and shown to the user
 *  before they write this summary — it informs the text, it does not replace it. Scoring
 *  what actually happened is the user's job; the engine's job is to stop them
 *  misremembering it. */
export async function closeExperiment(input: CloseExperimentInput): Promise<ActionResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const summary = input.outcomeSummary.trim();
  if (!summary) return { ok: false, error: "Say what happened — a closed trial with no finding teaches nothing." };

  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const today = getUserLocalToday(profileResult.data.timezone, new Date());

  // endDate is required by scoreExperiment on purpose: the data layer has no timezone,
  // so a default there would necessarily be a UTC date in a local-date column.
  const result = await scoreExperiment(client, input.experimentId, {
    status: input.status,
    outcomeSummary: summary,
    endDate: today,
  });
  if (!result.ok) return { ok: false, error: result.error.message };

  revalidatePath("/insights");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// U7 — the decision journal.
//
// Built in L8 with log/score/list and no caller on either platform. The brief wants
// decisions recorded with their reasoning and a prediction, then scored later, so that
// systematic decision errors surface over time. Same observe-then-score shape as
// experiments (U9) and daily predictions — which is why they live on the same screen.
// ---------------------------------------------------------------------------

export interface LogDecisionActionInput {
  decision: string;
  rationale?: string;
  /** Confidence, 0-100. Optional and genuinely unset when not given — never defaulted.
   *  A fabricated confidence is exactly what poisoned the first calibration point a new
   *  user ever produced (E0), and a decision journal exists to measure this. */
  predictionPct?: number;
  predictedOutcome?: string;
}

export async function logDecisionAction(input: LogDecisionActionInput): Promise<ActionResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const decision = input.decision.trim();
  if (!decision) return { ok: false, error: "What did you decide?" };

  if (input.predictionPct != null && (!Number.isFinite(input.predictionPct) || input.predictionPct < 0 || input.predictionPct > 100)) {
    return { ok: false, error: "Confidence is a percentage between 0 and 100." };
  }

  const result = await logDecision(client, user.id, {
    decision,
    ...(input.rationale?.trim() ? { rationale: input.rationale.trim() } : {}),
    ...(input.predictionPct != null ? { predictionPct: input.predictionPct } : {}),
    ...(input.predictedOutcome?.trim() ? { predictedOutcome: input.predictedOutcome.trim() } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };

  revalidatePath("/insights");
  return { ok: true };
}

/** Records what actually happened. Idempotent — re-scoring overwrites, same as
 *  scorePredictionForDate. */
export async function scoreDecisionAction(input: { decisionId: number; actualOutcome: string }): Promise<ActionResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const actualOutcome = input.actualOutcome.trim();
  if (!actualOutcome) return { ok: false, error: "Say what actually happened." };

  const result = await scoreDecision(client, input.decisionId, { actualOutcome });
  if (!result.ok) return { ok: false, error: result.error.message };

  revalidatePath("/insights");
  return { ok: true };
}
