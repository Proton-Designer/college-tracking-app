"use server";

import { revalidatePath } from "next/cache";
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
  updatePrayerSettings,
  type AccountExport,
  type CommitmentLevel,
  type CreateKillHabitInput,
  type OAuthProvider,
  type PrayerSettingsInput,
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

/**
 * Upper bound on the self-service monthly LLM ceiling. The pre-flight budget check in the
 * edge-function gateway is the ONLY spend throttle in the system -- there is no rate limit
 * behind it -- so this value is the brake, and a field the user can set to anything is not
 * a brake. $200 is far above real single-user usage (the default is $5) while keeping a
 * fat-fingered "50000" from authorising five figures of spend.
 *
 * Enforced here rather than only in the client: this is a server action, so the component's
 * validation is a convenience, not a control. Mirrored by a CHECK constraint in the
 * migration that adds the database-level bound -- keep the two numbers in step.
 */
const MAX_LLM_MONTHLY_BUDGET_USD = 200;

export async function updateLlmBudget(llmMonthlyBudgetUsd: number): Promise<ActionResult> {
  const caller = await requireUserId();
  if (!caller.ok) return caller;
  if (!Number.isFinite(llmMonthlyBudgetUsd) || llmMonthlyBudgetUsd <= 0) {
    return { ok: false, error: "Monthly budget must be a positive number." };
  }
  if (llmMonthlyBudgetUsd > MAX_LLM_MONTHLY_BUDGET_USD) {
    return { ok: false, error: `Monthly budget cannot exceed $${MAX_LLM_MONTHLY_BUDGET_USD}.` };
  }
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

/** E4: the ONLY path from a staged ics_event_extractions row to a real calendar_events
 *  write is the brightspace-confirm Edge Function -- see
 *  supabase/functions/_shared/brightspace/confirm.ts's own header for why this can't be
 *  a direct client write. courseId defaults to whatever the sync already matched from
 *  the event's summary text (packages/api/src/data/brightspaceFeeds.ts's
 *  confirmIcsEvent), not re-picked here. */
export async function confirmIcsEventAction(
  extractionId: number,
  decision: "confirmed" | "rejected",
  isClassMeeting?: boolean,
  courseId?: number,
): Promise<ActionResult> {
  const client = await getServerSupabaseClient();
  const result = await confirmIcsEvent(client, {
    extractionId,
    decision,
    ...(isClassMeeting != null ? { isClassMeeting } : {}),
    ...(courseId != null ? { courseId } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/settings");
  return { ok: true };
}

/**
 * Location + prayer calculation (D39: per-user, never a constant).
 *
 * Validation lives in `@collegeos/api`'s `updatePrayerSettings`, not here, so mobile's
 * settingsActions.ts and this server action cannot disagree about what a legal coordinate is.
 * Revalidates /deen as well as /settings: the whole Deen page is a function of these four
 * values, and leaving it cached would show the "no location set" state after one was set.
 */
export async function updatePrayerSettingsAction(input: PrayerSettingsInput): Promise<ActionResult> {
  const caller = await requireUserId();
  if (!caller.ok) return caller;
  const client = await getServerSupabaseClient();
  const result = await updatePrayerSettings(client, caller.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/settings");
  revalidatePath("/deen");
  return { ok: true };
}
