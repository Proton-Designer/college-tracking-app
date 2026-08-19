"use server";

import { updateTaskStatus, type TaskStatus } from "@collegeos/api";
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
