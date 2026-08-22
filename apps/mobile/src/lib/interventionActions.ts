import {
  getIntervention,
  getOwnProfile,
  getUserLocalToday,
  markInterventionDelivered,
  recordInterventionResponse,
  respondToDeviationPrompt,
  respondToStaleTaskPrompt,
} from "@collegeos/api";
import type { DeviationPromptAction, StaleTaskPromptAction } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

/**
 * U1 — mirrors apps/web/src/app/(app)/today/interventionActions.ts. Behaviour is identical
 * by requirement; only the transport differs (direct client calls rather than server
 * actions, and a refetch callback rather than revalidatePath).
 *
 * Dispatched by kind because two kinds do more than record an answer: a deviation prompt
 * also logs a friction cause, and a stale-task prompt also cancels or re-plans the
 * underlying task. Routing everything through the generic recorder would silently drop
 * those side effects.
 */

export interface InterventionActionResult {
  ok: boolean;
  error?: string;
}

export async function respondToInterventionAction(input: {
  userId: string;
  interventionId: number;
  action: string;
}): Promise<InterventionActionResult> {
  const client = getMobileSupabaseClient();

  const interventionResult = await getIntervention(client, input.interventionId);
  if (!interventionResult.ok) return { ok: false, error: interventionResult.error.message };
  const intervention = interventionResult.data;
  if (!intervention) return { ok: false, error: "That prompt is no longer available." };

  // Validated against the intervention's own actions, which recordInterventionResponse
  // documents as application-layer work -- a stale client can't write an action the prompt
  // never offered.
  if (!intervention.actions.includes(input.action)) {
    return { ok: false, error: "That isn't one of this prompt's options." };
  }

  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const today = getUserLocalToday(profileResult.data.timezone, new Date());

  if (intervention.kind === "deviation_prompt") {
    const result = await respondToDeviationPrompt(client, input.userId, intervention.id, input.action as DeviationPromptAction);
    if (!result.ok) return { ok: false, error: result.error.message };
  } else if (intervention.kind === "stale_task_prompt") {
    const result = await respondToStaleTaskPrompt(client, intervention.id, input.action as StaleTaskPromptAction, today);
    if (!result.ok) return { ok: false, error: result.error.message };
  } else {
    const result = await recordInterventionResponse(client, intervention.id, { status: "acted_on", actionTaken: input.action });
    if (!result.ok) return { ok: false, error: result.error.message };
  }

  return { ok: true };
}

/** "Shown and ignored" is a real, countable outcome -- leaving a prompt pending forever
 *  would quietly inflate the denominator of "did an intervention change behaviour". */
export async function dismissInterventionAction(input: { interventionId: number }): Promise<InterventionActionResult> {
  const client = getMobileSupabaseClient();
  const result = await recordInterventionResponse(client, input.interventionId, { status: "ignored" });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** Marks prompts actually seen. Failure costs a measurement, not the user's ability to
 *  respond, so it is swallowed rather than surfaced. */
export async function markInterventionsDeliveredAction(input: { interventionIds: number[] }): Promise<void> {
  const client = getMobileSupabaseClient();
  for (const id of input.interventionIds) {
    const result = await markInterventionDelivered(client, id);
    if (!result.ok) break;
  }
}
