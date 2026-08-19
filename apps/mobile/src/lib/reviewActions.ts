import { logFriction, submitNightReview, type FrictionCause, type SubmitNightReviewInput } from "@collegeos/api";
import { getMobileSupabaseClient } from "./supabase/client";

export async function logFrictionForTask(userId: string, taskId: number, cause: FrictionCause): Promise<{ ok: boolean; error?: string }> {
  const client = getMobileSupabaseClient();
  const result = await logFriction(client, userId, { cause, relatedTaskId: taskId });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function submitReview(input: SubmitNightReviewInput): Promise<{ ok: boolean; error?: string }> {
  const client = getMobileSupabaseClient();
  const result = await submitNightReview(client, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
