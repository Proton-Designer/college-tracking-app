"use server";

import { revalidatePath } from "next/cache";
import { createWorry, setWorryStatus } from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface WorriesActionResult {
  ok: boolean;
  error?: string;
}

async function requireUser() {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  return { ok: true as const, client, userId: user.id };
}

export async function addWorryAction(text: string): Promise<WorriesActionResult> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await createWorry(caller.client, caller.userId, text);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/worries");
  return { ok: true };
}

export async function markWorryDoneAction(worryId: number): Promise<WorriesActionResult> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await setWorryStatus(caller.client, caller.userId, worryId, "done");
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/worries");
  return { ok: true };
}
