"use server";

import { revalidatePath } from "next/cache";
import {
  connectBrightspaceFeed,
  createKillHabit,
  deactivateKillHabit,
  deleteOwnAccount,
  disconnectBrightspaceFeed,
  disconnectIntegration,
  exportOwnAccount,
  setMaxEscalationLevel,
  updateKillHabit,
  updateOwnProfile,
  type AccountExport,
  type CommitmentLevel,
  type CreateKillHabitInput,
  type OAuthProvider,
  type UpdateKillHabitInput,
} from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireUserId(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  return { ok: true, userId: user.id };
}

export interface UpdateProfileInput {
  timezone: string;
  sleepBaselineHours: number | null;
}

export async function updateProfileAction(input: UpdateProfileInput): Promise<ActionResult> {
  const caller = await requireUserId();
  if (!caller.ok) return caller;
  const client = await getServerSupabaseClient();
  const result = await updateOwnProfile(client, caller.userId, {
    timezone: input.timezone,
    sleep_baseline_hours: input.sleepBaselineHours,
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateLlmBudget(llmMonthlyBudgetUsd: number): Promise<ActionResult> {
  const caller = await requireUserId();
  if (!caller.ok) return caller;
  const client = await getServerSupabaseClient();
  const result = await updateOwnProfile(client, caller.userId, { llm_monthly_budget_usd: llmMonthlyBudgetUsd });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function createKillHabitAction(input: CreateKillHabitInput): Promise<ActionResult> {
  const caller = await requireUserId();
  if (!caller.ok) return caller;
  const client = await getServerSupabaseClient();
  const result = await createKillHabit(client, caller.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function updateKillHabitAction(killHabitId: number, input: UpdateKillHabitInput): Promise<ActionResult> {
  const caller = await requireUserId();
  if (!caller.ok) return caller;
  const client = await getServerSupabaseClient();
  const result = await updateKillHabit(client, caller.userId, killHabitId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function setMaxEscalationLevelAction(killHabitId: number, maxEscalationLevel: CommitmentLevel): Promise<ActionResult> {
  const caller = await requireUserId();
  if (!caller.ok) return caller;
  const client = await getServerSupabaseClient();
  const result = await setMaxEscalationLevel(client, caller.userId, killHabitId, maxEscalationLevel);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function deactivateKillHabitAction(killHabitId: number): Promise<ActionResult> {
  const caller = await requireUserId();
  if (!caller.ok) return caller;
  const client = await getServerSupabaseClient();
  const result = await deactivateKillHabit(client, caller.userId, killHabitId);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function disconnectIntegrationAction(provider: OAuthProvider): Promise<ActionResult> {
  const caller = await requireUserId();
  if (!caller.ok) return caller;
  const client = await getServerSupabaseClient();
  const result = await disconnectIntegration(client, caller.userId, provider);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function connectBrightspaceFeedAction(icsUrl: string): Promise<ActionResult> {
  const caller = await requireUserId();
  if (!caller.ok) return caller;
  const client = await getServerSupabaseClient();
  const result = await connectBrightspaceFeed(client, caller.userId, icsUrl);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export async function disconnectBrightspaceFeedAction(): Promise<ActionResult> {
  const caller = await requireUserId();
  if (!caller.ok) return caller;
  const client = await getServerSupabaseClient();
  const result = await disconnectBrightspaceFeed(client, caller.userId);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/settings");
  return { ok: true };
}

export type ExportAccountActionResult = { ok: true; data: AccountExport } | { ok: false; error: string };

export async function exportAccountAction(): Promise<ExportAccountActionResult> {
  const client = await getServerSupabaseClient();
  const result = await exportOwnAccount(client);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export type DeleteAccountActionResult = { ok: true } | { ok: false; error: string };

/** confirmEmail is checked again by the server (account-delete Edge Function) regardless
 *  of what this action or the UI does -- this parameter makes the caller's intent
 *  deliberate, it does not authorize anything the server wouldn't otherwise refuse. */
export async function deleteAccountAction(confirmEmail: string): Promise<DeleteAccountActionResult> {
  const client = await getServerSupabaseClient();
  const result = await deleteOwnAccount(client, confirmEmail);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
