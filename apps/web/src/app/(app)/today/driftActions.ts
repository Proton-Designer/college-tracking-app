"use server";

import { recordResponse, recordShown } from "@collegeos/api";
import type { DriftResponse, DriftTrigger } from "@collegeos/core";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export type DriftActionResult = { ok: true } | { ok: false; error: string };

async function requireUser() {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  return { ok: true as const, client, userId: user.id };
}

/**
 * Records that a confrontation was actually shown.
 *
 * Called at display time rather than at decision time, so a row in `drift_events` means a person
 * saw something. That is what makes the rate limit auditable instead of merely intended — a promise
 * nobody can check is a hope.
 */
export async function recordDriftShownAction(input: {
  dimensionId: number;
  trigger: DriftTrigger;
  localDate: string;
  evidence: Record<string, number | string>;
}): Promise<DriftActionResult & { eventId?: number }> {
  const caller = await requireUser();
  if (!caller.ok) return { ok: false, error: caller.error };

  const result = await recordShown(caller.client, caller.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, eventId: result.data.id };
}

/** Records what the person did. `dismissed` is an outcome, never a failure. */
export async function respondToDriftAction(input: {
  eventId: number;
  response: DriftResponse;
}): Promise<DriftActionResult> {
  const caller = await requireUser();
  if (!caller.ok) return { ok: false, error: caller.error };

  const result = await recordResponse(caller.client, caller.userId, input.eventId, input.response);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
