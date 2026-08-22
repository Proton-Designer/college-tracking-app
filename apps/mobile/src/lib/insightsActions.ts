import {
  createExperiment,
  getOwnProfile,
  getUserLocalToday,
  logExperimentMeasurement,
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
