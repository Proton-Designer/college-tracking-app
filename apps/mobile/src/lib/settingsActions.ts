import {
  confirmIcsEvent,
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
import { getMobileSupabaseClient } from "./supabase/client";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** Mirrors apps/web/src/app/(app)/settings/actions.ts's server actions, one-for-one --
 *  same functions, called directly against the mobile client instead of through a
 *  server action, since mobile has no server layer to route through. */
export async function updateProfileAction(userId: string, input: { timezone: string; sleepBaselineHours: number | null }): Promise<ActionResult> {
  const client = getMobileSupabaseClient();
  const result = await updateOwnProfile(client, userId, { timezone: input.timezone, sleep_baseline_hours: input.sleepBaselineHours });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function updateLlmBudgetAction(userId: string, llmMonthlyBudgetUsd: number): Promise<ActionResult> {
  const client = getMobileSupabaseClient();
  const result = await updateOwnProfile(client, userId, { llm_monthly_budget_usd: llmMonthlyBudgetUsd });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function createKillHabitAction(userId: string, input: CreateKillHabitInput): Promise<ActionResult> {
  const client = getMobileSupabaseClient();
  const result = await createKillHabit(client, userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function updateKillHabitAction(userId: string, killHabitId: number, input: UpdateKillHabitInput): Promise<ActionResult> {
  const client = getMobileSupabaseClient();
  const result = await updateKillHabit(client, userId, killHabitId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function setMaxEscalationLevelAction(userId: string, killHabitId: number, maxEscalationLevel: CommitmentLevel): Promise<ActionResult> {
  const client = getMobileSupabaseClient();
  const result = await setMaxEscalationLevel(client, userId, killHabitId, maxEscalationLevel);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function deactivateKillHabitAction(userId: string, killHabitId: number): Promise<ActionResult> {
  const client = getMobileSupabaseClient();
  const result = await deactivateKillHabit(client, userId, killHabitId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function disconnectIntegrationAction(userId: string, provider: OAuthProvider): Promise<ActionResult> {
  const client = getMobileSupabaseClient();
  const result = await disconnectIntegration(client, userId, provider);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function connectBrightspaceFeedAction(userId: string, icsUrl: string): Promise<ActionResult> {
  const client = getMobileSupabaseClient();
  const result = await connectBrightspaceFeed(client, userId, icsUrl);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function disconnectBrightspaceFeedAction(userId: string): Promise<ActionResult> {
  const client = getMobileSupabaseClient();
  const result = await disconnectBrightspaceFeed(client, userId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function confirmIcsEventAction(
  extractionId: number,
  decision: "confirmed" | "rejected",
  isClassMeeting?: boolean,
  courseId?: number,
): Promise<ActionResult> {
  const client = getMobileSupabaseClient();
  const result = await confirmIcsEvent(client, {
    extractionId,
    decision,
    ...(isClassMeeting != null ? { isClassMeeting } : {}),
    ...(courseId != null ? { courseId } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export type ExportAccountActionResult = { ok: true; data: AccountExport } | { ok: false; error: string };

export async function exportAccountAction(): Promise<ExportAccountActionResult> {
  const client = getMobileSupabaseClient();
  const result = await exportOwnAccount(client);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export type DeleteAccountActionResult = { ok: true } | { ok: false; error: string };

export async function deleteAccountAction(confirmEmail: string): Promise<DeleteAccountActionResult> {
  const client = getMobileSupabaseClient();
  const result = await deleteOwnAccount(client, confirmEmail);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
