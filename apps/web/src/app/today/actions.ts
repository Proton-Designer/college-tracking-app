"use server";

import { revalidatePath } from "next/cache";
import { submitMorningCheckin, updateTaskStatus, type SubmitMorningCheckinInput, type TaskStatus } from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface ToggleTaskResult {
  ok: boolean;
  error?: string;
}

/** RLS scopes this to the caller's own tasks — no explicit ownership check needed here. */
export async function toggleTaskCompletion(taskId: number, nextStatus: TaskStatus): Promise<ToggleTaskResult> {
  const client = await getServerSupabaseClient();
  const result = await updateTaskStatus(client, taskId, nextStatus);
  if (!result.ok) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true };
}

export interface SubmitCheckinResult {
  ok: boolean;
  error?: string;
}

export async function submitCheckin(
  input: Omit<SubmitMorningCheckinInput, "userId">,
): Promise<SubmitCheckinResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const result = await submitMorningCheckin(client, { ...input, userId: user.id });
  if (!result.ok) return { ok: false, error: result.error.message };

  revalidatePath("/today");
  return { ok: true };
}
