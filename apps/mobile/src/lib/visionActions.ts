import {
  getActiveMom,
  getOwnProfile,
  getUserLocalToday,
  loadUnanchoredDrift,
  loadVisionChain,
  saveBeachhead,
  saveMission,
  saveMom,
  saveMomReview,
  saveVision,
  setGoalAnchor,
  setTaskAnchor,
  type MomOutcome,
  type MomRow,
  type SaveChainNodeInput,
  type SaveVisionInput,
  type VisionChainView,
} from "@collegeos/api";
import { addDays, startOfWeek, type UnanchoredReport } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

/**
 * Mirrors apps/web/src/app/(app)/vision/visionActions.ts one-for-one — same functions, same
 * argument shapes, called directly against the mobile client instead of through a server action,
 * since mobile has no server layer to route through. Same arrangement as deenActions and
 * selfActions on both platforms.
 *
 * Every "today" is re-derived from the profile at call time rather than closed over from render:
 * a screen left open across midnight would otherwise file a 90-day review under yesterday, and
 * this product is about local days (B4).
 */

export interface VisionActionResult {
  ok: boolean;
  error?: string;
}

export type VisionLoadResult = { ok: true; data: VisionChainView } | { ok: false; error: string };

async function today(): Promise<{ ok: true; value: string } | { ok: false; error: string }> {
  const client = getMobileSupabaseClient();
  const profile = await getOwnProfile(client);
  if (!profile.ok) return { ok: false, error: profile.error.message };
  return { ok: true, value: getUserLocalToday(profile.data.timezone, new Date()) };
}

export async function loadVision(userId: string): Promise<VisionLoadResult> {
  const client = getMobileSupabaseClient();
  const day = await today();
  if (!day.ok) return { ok: false, error: day.error };

  const result = await loadVisionChain(client, userId, { today: day.value });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export async function saveVisionAction(
  userId: string,
  input: SaveVisionInput,
): Promise<VisionActionResult> {
  const result = await saveVision(getMobileSupabaseClient(), userId, input);
  return result.ok ? { ok: true } : { ok: false, error: result.error.message };
}

export async function saveBeachheadAction(
  userId: string,
  input: SaveChainNodeInput,
): Promise<VisionActionResult> {
  const result = await saveBeachhead(getMobileSupabaseClient(), userId, input);
  return result.ok ? { ok: true } : { ok: false, error: result.error.message };
}

export async function saveMissionAction(
  userId: string,
  input: SaveChainNodeInput,
): Promise<VisionActionResult> {
  const result = await saveMission(getMobileSupabaseClient(), userId, input);
  return result.ok ? { ok: true } : { ok: false, error: result.error.message };
}

export async function saveMomAction(
  userId: string,
  input: SaveChainNodeInput,
): Promise<VisionActionResult> {
  const result = await saveMom(getMobileSupabaseClient(), userId, input);
  return result.ok ? { ok: true } : { ok: false, error: result.error.message };
}

/** Attaches or detaches a War Map goal. Detaching is always allowed and never explained away. */
export async function setGoalAnchorAction(
  userId: string,
  goalId: number,
  momId: number | null,
): Promise<VisionActionResult> {
  const result = await setGoalAnchor(getMobileSupabaseClient(), userId, goalId, momId);
  return result.ok ? { ok: true } : { ok: false, error: result.error.message };
}

/** The door beside the drift list: attach one MIT, or leave it exactly as it is. */
export async function setTaskAnchorAction(
  userId: string,
  taskId: number,
  momId: number | null,
): Promise<VisionActionResult> {
  const result = await setTaskAnchor(getMobileSupabaseClient(), userId, taskId, momId);
  return result.ok ? { ok: true } : { ok: false, error: result.error.message };
}

/** The active M.O.M. for the Night Plan's optional picker. Null means no picker at all. */
export async function loadActiveMom(
  userId: string,
): Promise<{ ok: true; data: MomRow | null } | { ok: false; error: string }> {
  const result = await getActiveMom(getMobileSupabaseClient(), userId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

/**
 * The week's drift report for the Sunday review.
 *
 * The window is the Sunday-anchored local week, the same boundary the rest of the weekly surface
 * uses, so the sentence on this screen and the one on web describe the same seven days.
 */
export async function loadWeekDrift(
  userId: string,
): Promise<{ ok: true; data: UnanchoredReport } | { ok: false; error: string }> {
  const client = getMobileSupabaseClient();
  const day = await today();
  if (!day.ok) return { ok: false, error: day.error };

  const from = startOfWeek(day.value);
  const to = addDays(from, 6);
  const result = await loadUnanchoredDrift(client, userId, { from, to });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export interface SaveMomReviewActionInput {
  momId: number;
  outcome: MomOutcome;
  whatHappened?: string;
  next?: { title: string; target?: string; startsOn?: string | null; endsOn?: string | null } | null;
}

export async function saveMomReviewAction(
  userId: string,
  input: SaveMomReviewActionInput,
): Promise<VisionActionResult> {
  const client = getMobileSupabaseClient();
  const day = await today();
  if (!day.ok) return { ok: false, error: day.error };

  const result = await saveMomReview(client, userId, {
    momId: input.momId,
    localDate: day.value,
    outcome: input.outcome,
    ...(input.whatHappened !== undefined ? { whatHappened: input.whatHappened } : {}),
    ...(input.next !== undefined ? { next: input.next } : {}),
  });
  return result.ok ? { ok: true } : { ok: false, error: result.error.message };
}
