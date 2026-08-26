"use server";

import {
  getOwnProfile,
  getUserLocalToday,
  recordAttempt,
  type AttemptRow,
} from "@collegeos/api";
import type { RetrievalConfidence } from "@collegeos/core";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface DrillActionResult<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

/** One drill answer: the calibration tap happened BEFORE reveal; the verdict after.
 *  localDate is computed server-side from the profile timezone, never a UTC slice (B4). */
export async function answerQuestionAction(
  questionId: number,
  confidence: RetrievalConfidence,
  correct: boolean,
): Promise<DrillActionResult<AttemptRow>> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const localDate = getUserLocalToday(profileResult.data.timezone, new Date());

  const result = await recordAttempt(client, user.id, { questionId, localDate, confidence, correct });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}
