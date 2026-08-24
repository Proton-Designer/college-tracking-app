import { createWorry, listWorries, setWorryStatus, type WorryRow } from "@collegeos/api";
import { getMobileSupabaseClient } from "./supabase/client";

export interface WorryActionResult {
  ok: boolean;
  error?: string;
}

export async function loadWorries(
  userId: string,
): Promise<{ ok: true; data: WorryRow[] } | { ok: false; error: string }> {
  const client = getMobileSupabaseClient();
  const result = await listWorries(client, userId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export async function addWorry(userId: string, text: string): Promise<WorryActionResult> {
  const client = getMobileSupabaseClient();
  const result = await createWorry(client, userId, text);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function markWorryDone(userId: string, worryId: number): Promise<WorryActionResult> {
  const client = getMobileSupabaseClient();
  const result = await setWorryStatus(client, userId, worryId, "done");
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
