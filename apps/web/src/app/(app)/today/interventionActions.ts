"use server";

import { revalidatePath } from "next/cache";
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
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * U1 — responding to an intervention.
 *
 * Kept in its own file rather than added to `today/actions.ts` deliberately: that file was
 * being edited concurrently for the onboarding gate and task quick-add, and a shared
 * working tree makes "just add it to the existing file" an avoidable collision (D21/D22).
 *
 * Response is dispatched by kind because two kinds do more than record an answer:
 * a deviation prompt also logs a friction cause, and a stale-task prompt also cancels or
 * re-plans the underlying task. Routing everything through the generic recorder would
 * silently drop those side effects — which is the whole reason those wrappers exist.
 */

export interface InterventionActionResult {
  ok: boolean;
  error?: string;
}

export async function respondToInterventionAction(input: {
  interventionId: number;
  action: string;
}): Promise<InterventionActionResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const interventionResult = await getIntervention(client, input.interventionId);
  if (!interventionResult.ok) return { ok: false, error: interventionResult.error.message };
  const intervention = interventionResult.data;
  if (!intervention) return { ok: false, error: "That prompt is no longer available." };

  // `actions` is the intervention's own list, and recordInterventionResponse documents that
  // validating against it is application-layer work. Checking here means a stale client --
  // one showing buttons from a prompt that has since changed -- can't write an action the
  // intervention never actually offered.
  if (!intervention.actions.includes(input.action)) {
    return { ok: false, error: "That isn't one of this prompt's options." };
  }

  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const today = getUserLocalToday(profileResult.data.timezone, new Date());

  if (intervention.kind === "deviation_prompt") {
    const result = await respondToDeviationPrompt(client, user.id, intervention.id, input.action as DeviationPromptAction);
    if (!result.ok) return { ok: false, error: result.error.message };
  } else if (intervention.kind === "stale_task_prompt") {
    const result = await respondToStaleTaskPrompt(client, intervention.id, input.action as StaleTaskPromptAction, today);
    if (!result.ok) return { ok: false, error: result.error.message };
  } else {
    const result = await recordInterventionResponse(client, intervention.id, {
      status: "acted_on",
      actionTaken: input.action,
    });
    if (!result.ok) return { ok: false, error: result.error.message };
  }

  revalidatePath("/today");
  return { ok: true };
}

/** "Shown and ignored" is a real, countable outcome — the brief's north-star question is
 *  whether an intervention changed behaviour, and an intervention the user saw and chose not
 *  to act on answers that as informatively as one they acted on. Recording it as `ignored`
 *  is the honest option; leaving it pending forever would quietly inflate the denominator. */
export async function dismissInterventionAction(input: { interventionId: number }): Promise<InterventionActionResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const result = await recordInterventionResponse(client, input.interventionId, { status: "ignored" });
  if (!result.ok) return { ok: false, error: result.error.message };

  revalidatePath("/today");
  return { ok: true };
}

/** Marks interventions as actually seen. Called from the client on mount rather than from
 *  the server loader on purpose: `createIntervention`'s own comment notes that with no push
 *  infrastructure, "created" and "delivered" are genuinely different moments, and a server
 *  render the user never looked at is not delivery either. Mounting in their browser is the
 *  closest honest signal we have.
 *
 *  Does not revalidate — `listPendingInterventions` returns both `pending` and `delivered`,
 *  so nothing on screen changes and a refetch would just be churn. */
export async function markInterventionsDeliveredAction(input: {
  interventionIds: number[];
}): Promise<InterventionActionResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  for (const id of input.interventionIds) {
    const result = await markInterventionDelivered(client, id);
    // A failure here costs a measurement, not the user's ability to respond — so it is
    // swallowed rather than surfaced. The prompt is on screen regardless.
    if (!result.ok) break;
  }

  return { ok: true };
}
