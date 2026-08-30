"use server";

import { revalidatePath } from "next/cache";
import {
  getOwnProfile,
  getUserLocalToday,
  saveBeachhead,
  saveMission,
  saveMom,
  saveMomReview,
  saveVision,
  setGoalAnchor,
  setTaskAnchor,
  type MomOutcome,
  type SaveChainNodeInput,
  type SaveVisionInput,
} from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Server actions for the vision chain (D48).
 *
 * Every one of them can write an unanchored row, and none of them refuses to. `parentId` arriving
 * as null is a deliberate edit — "this doesn't step down from anything yet" — not a missing field
 * to reject, and the actions pass it through untouched.
 */

export interface VisionActionResult {
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

/** Both surfaces read the same chain, so both are revalidated after any write to it. */
function revalidateChain() {
  revalidatePath("/vision");
  revalidatePath("/vision/review");
}

export async function saveVisionAction(input: SaveVisionInput): Promise<VisionActionResult> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await saveVision(caller.client, caller.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidateChain();
  return { ok: true };
}

export async function saveBeachheadAction(input: SaveChainNodeInput): Promise<VisionActionResult> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await saveBeachhead(caller.client, caller.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidateChain();
  return { ok: true };
}

export async function saveMissionAction(input: SaveChainNodeInput): Promise<VisionActionResult> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await saveMission(caller.client, caller.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidateChain();
  return { ok: true };
}

export async function saveMomAction(input: SaveChainNodeInput): Promise<VisionActionResult> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await saveMom(caller.client, caller.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidateChain();
  return { ok: true };
}

/** Attaches (or detaches, with null) a War Map goal. Detaching is always allowed. */
export async function setGoalAnchorAction(goalId: number, momId: number | null): Promise<VisionActionResult> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await setGoalAnchor(caller.client, caller.userId, goalId, momId);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidateChain();
  revalidatePath("/goals");
  return { ok: true };
}

/**
 * Attaches (or detaches) one MIT — the door beside the drift list.
 *
 * Naming an unanchored night and then offering no way to act on it would be the confrontation
 * without the path back. Attaching here is one click, and so is deciding the night was fine as it
 * was and leaving it alone.
 */
export async function setTaskAnchorAction(taskId: number, momId: number | null): Promise<VisionActionResult> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const result = await setTaskAnchor(caller.client, caller.userId, taskId, momId);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidateChain();
  revalidatePath("/today");
  revalidatePath("/week");
  return { ok: true };
}

export interface SaveMomReviewActionInput {
  momId: number;
  outcome: MomOutcome;
  whatHappened?: string;
  next?: { title: string; target?: string; startsOn?: string | null; endsOn?: string | null } | null;
}

/**
 * Closes the 90 days.
 *
 * The review's `local_date` is derived from the profile timezone here rather than taken from the
 * client: a ritual written at 11pm belongs to the day the user is standing in (B4).
 */
export async function saveMomReviewAction(input: SaveMomReviewActionInput): Promise<VisionActionResult> {
  const caller = await requireUser();
  if (!caller.ok) return caller;

  const profile = await getOwnProfile(caller.client);
  if (!profile.ok) return { ok: false, error: profile.error.message };
  const today = getUserLocalToday(profile.data.timezone, new Date());

  const result = await saveMomReview(caller.client, caller.userId, {
    momId: input.momId,
    localDate: today,
    outcome: input.outcome,
    ...(input.whatHappened !== undefined ? { whatHappened: input.whatHappened } : {}),
    ...(input.next !== undefined ? { next: input.next } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidateChain();
  revalidatePath("/review");
  return { ok: true };
}
