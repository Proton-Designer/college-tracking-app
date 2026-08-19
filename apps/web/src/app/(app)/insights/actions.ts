"use server";

import { revalidatePath } from "next/cache";
import { createExperiment, getUserLocalToday, getOwnProfile } from "@collegeos/api";
import { addDays } from "@collegeos/core";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface RunExperimentInput {
  insightId: number;
  hypothesis: string;
  protocol?: string;
  durationDays: number;
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

  const result = await createExperiment(client, user.id, {
    insightId: input.insightId,
    hypothesis: input.hypothesis,
    startDate: today,
    endDate: addDays(today, input.durationDays),
    ...(input.protocol ? { protocol: input.protocol } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };

  revalidatePath("/insights");
  return { ok: true };
}
