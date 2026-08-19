import { createExperiment, getOwnProfile, getUserLocalToday } from "@collegeos/api";
import { addDays } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

export interface RunExperimentInput {
  userId: string;
  insightId: number;
  hypothesis: string;
  protocol?: string;
  durationDays: number;
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

  const result = await createExperiment(client, input.userId, {
    insightId: input.insightId,
    hypothesis: input.hypothesis,
    startDate: today,
    endDate: addDays(today, input.durationDays),
    ...(input.protocol ? { protocol: input.protocol } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
