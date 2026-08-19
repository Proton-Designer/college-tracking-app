"use server";

import { revalidatePath } from "next/cache";
import { logFriction, submitNightReview, type FrictionCause } from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

async function requireUserId(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  return { ok: true, userId: user.id };
}

export interface LogFrictionResult {
  ok: boolean;
  error?: string;
}

/** Fires as soon as a chip is tapped — "one-tap" per the spec, not batched with the final
 *  submit. A friction moment is its own fact regardless of whether the reflection form
 *  underneath it ever gets submitted. */
export async function logFrictionForTask(
  taskId: number,
  cause: FrictionCause,
): Promise<LogFrictionResult> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;

  const client = await getServerSupabaseClient();
  const result = await logFriction(client, auth.userId, { cause, relatedTaskId: taskId });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export interface SubmitReviewInput {
  localDate: string;
  proudText?: string;
  wentWrongText?: string;
  importantNoteText?: string;
}

export interface SubmitReviewResult {
  ok: boolean;
  error?: string;
}

export async function submitReview(input: SubmitReviewInput): Promise<SubmitReviewResult> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;

  const client = await getServerSupabaseClient();
  const result = await submitNightReview(client, { userId: auth.userId, ...input });
  if (!result.ok) return { ok: false, error: result.error.message };

  revalidatePath("/review");
  return { ok: true };
}
