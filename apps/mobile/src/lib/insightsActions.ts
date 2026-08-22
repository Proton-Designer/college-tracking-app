import {
  createExperiment,
  getOwnProfile,
  getUserLocalToday,
  logDecision,
  logExperimentMeasurement,
  scoreDecision,
  scoreExperiment,
} from "@collegeos/api";
import { addDays } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

export interface RunExperimentInput {
  userId: string;
  insightId: number;
  hypothesis: string;
  protocol?: string;
  durationDays: number;
  /** U9: what this trial measures, what it was before, and which way it should move.
   *  Without all three getExperimentOutcome returns null and the trial is unscoreable
   *  no matter how many readings accumulate. Mirrors web. */
  metricName: string;
  baselineValue: number;
  hypothesizedDirection: "increase" | "decrease";
}

export interface RunExperimentResult {
  ok: boolean;
  error?: string;
}

/** Mirrors apps/web/src/app/(app)/insights/actions.ts's runExperiment. */
export async function runExperiment(input: RunExperimentInput): Promise<RunExperimentResult> {
  const client = getMobileSupabaseClient();
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };

  const today = getUserLocalToday(profileResult.data.timezone, new Date());

  const metricName = input.metricName.trim();
  if (!metricName) return { ok: false, error: "Name what this trial measures." };
  if (!Number.isFinite(input.baselineValue)) {
    return { ok: false, error: "Enter the measure's current value, so movement has something to move from." };
  }

  const result = await createExperiment(client, input.userId, {
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
  return { ok: true };
}

/** Mirrors web's logMeasurement. The date is always the user's own local today -- never
 *  `new Date().toISOString()`, which is a UTC date and would file an evening reading under
 *  the wrong day for anyone not on UTC (B4). */
export async function logMeasurement(input: {
  userId: string;
  experimentId: number;
  metric: string;
  value: number;
}): Promise<RunExperimentResult> {
  const client = getMobileSupabaseClient();

  const metric = input.metric.trim();
  if (!metric) return { ok: false, error: "Name the measure you're recording." };
  if (!Number.isFinite(input.value)) return { ok: false, error: "Enter a number." };

  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const today = getUserLocalToday(profileResult.data.timezone, new Date());

  const result = await logExperimentMeasurement(client, input.userId, {
    experimentId: input.experimentId,
    metric,
    value: input.value,
    localDate: today,
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** Mirrors web's closeExperiment. `endDate` is required by scoreExperiment on purpose --
 *  the data layer has no timezone, so a default there would be a UTC date in a local-date
 *  column. */
export async function closeExperiment(input: {
  experimentId: number;
  status: "completed" | "abandoned";
  outcomeSummary: string;
}): Promise<RunExperimentResult> {
  const client = getMobileSupabaseClient();

  const summary = input.outcomeSummary.trim();
  if (!summary) return { ok: false, error: "Say what happened -- a closed trial with no finding teaches nothing." };

  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const today = getUserLocalToday(profileResult.data.timezone, new Date());

  const result = await scoreExperiment(client, input.experimentId, {
    status: input.status,
    outcomeSummary: summary,
    endDate: today,
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** U7 — mirrors web's logDecisionAction. Confidence is optional and stays genuinely unset
 *  when not given; a defaulted confidence would be a fabricated one, and a decision journal
 *  exists to measure exactly that. */
export async function logDecisionAction(input: {
  userId: string;
  decision: string;
  rationale?: string;
  predictionPct?: number;
  predictedOutcome?: string;
}): Promise<RunExperimentResult> {
  const client = getMobileSupabaseClient();

  const decision = input.decision.trim();
  if (!decision) return { ok: false, error: "What did you decide?" };
  if (input.predictionPct != null && (!Number.isFinite(input.predictionPct) || input.predictionPct < 0 || input.predictionPct > 100)) {
    return { ok: false, error: "Confidence is a percentage between 0 and 100." };
  }

  const result = await logDecision(client, input.userId, {
    decision,
    ...(input.rationale?.trim() ? { rationale: input.rationale.trim() } : {}),
    ...(input.predictionPct != null ? { predictionPct: input.predictionPct } : {}),
    ...(input.predictedOutcome?.trim() ? { predictedOutcome: input.predictedOutcome.trim() } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** Mirrors web's scoreDecisionAction. Idempotent — re-scoring overwrites. */
export async function scoreDecisionAction(input: {
  decisionId: number;
  actualOutcome: string;
}): Promise<RunExperimentResult> {
  const client = getMobileSupabaseClient();

  const actualOutcome = input.actualOutcome.trim();
  if (!actualOutcome) return { ok: false, error: "Say what actually happened." };

  const result = await scoreDecision(client, input.decisionId, { actualOutcome });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
