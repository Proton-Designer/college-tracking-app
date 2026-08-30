"use server";

import { setDriftAlertsEnabled, setDriftStatement } from "@collegeos/api";
import { revalidatePath } from "next/cache";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export type DriftStatementResult = { ok: true } | { ok: false; error: string };

async function requireUser() {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  return { ok: true as const, client, userId: user.id };
}

/**
 * Writes or clears a dimension's drift statement.
 *
 * The app never authors this text — it stores exactly what was typed, trimmed, and treats an empty
 * string as clearing rather than as an empty statement. A dimension with no statement can never
 * fire a confrontation, so clearing it is the same as opting out, which is why no separate
 * confirmation is asked for either action.
 */
export async function setDriftStatementAction(
  dimensionId: number,
  statement: string,
): Promise<DriftStatementResult> {
  const caller = await requireUser();
  if (!caller.ok) return { ok: false, error: caller.error };

  const result = await setDriftStatement(caller.client, caller.userId, dimensionId, statement);
  if (!result.ok) return { ok: false, error: result.error.message };

  revalidatePath("/self");
  return { ok: true };
}

/** The per-dimension off switch. One tap, permanent until turned back on, no dialog. */
export async function toggleDriftAlertsAction(
  dimensionId: number,
  enabled: boolean,
): Promise<DriftStatementResult> {
  const caller = await requireUser();
  if (!caller.ok) return { ok: false, error: caller.error };

  const result = await setDriftAlertsEnabled(caller.client, caller.userId, dimensionId, enabled);
  if (!result.ok) return { ok: false, error: result.error.message };

  revalidatePath("/self");
  return { ok: true };
}
