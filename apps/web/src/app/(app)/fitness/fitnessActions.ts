"use server";

import { revalidatePath } from "next/cache";
import {
  activateWorkoutPlan,
  addPlanSessionExercise,
  createExercise,
  createPlanSession,
  createWorkoutPlan,
  deleteSet,
  getOwnProfile,
  getUserLocalToday,
  logBodyMetrics,
  logSet,
  setCycleAnchor,
  setExerciseActive,
  setWorkoutConfirmed,
  type MuscleGroupValue,
} from "@collegeos/api";
import type { LocalDate } from "@collegeos/core";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Server actions for /fitness. Mirrored one-for-one by apps/mobile/src/lib/fitnessActions.ts,
 * which calls the same `@collegeos/api` functions directly (mobile has no server layer to
 * route through) -- the same arrangement deenActions uses on both platforms.
 *
 * Every "today" action derives the local date on the server rather than trusting one from the
 * client. A page rendered at 23:58 and a set logged at 00:01 would otherwise land on
 * yesterday's workout, and the whole product is about local days (B4).
 */

export interface FitnessActionResult {
  ok: boolean;
  error?: string;
}

async function requireCaller() {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  const profile = await getOwnProfile(client);
  if (!profile.ok) return { ok: false as const, error: profile.error.message };
  return {
    ok: true as const,
    client,
    userId: user.id,
    today: getUserLocalToday(profile.data.timezone, new Date()),
  };
}

export async function addExerciseAction(input: {
  name: string;
  primaryMuscles: MuscleGroupValue[];
  secondaryMuscles: MuscleGroupValue[];
}): Promise<FitnessActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await createExercise(caller.client, caller.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/fitness");
  return { ok: true };
}

/** Retire a movement, or bring it back. Never a delete -- a logged set pointing at a vanished
 *  exercise would corrupt every historical volume number. */
export async function setExerciseActiveAction(exerciseId: number, active: boolean): Promise<FitnessActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await setExerciseActive(caller.client, caller.userId, exerciseId, active);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/fitness");
  return { ok: true };
}

export async function createPlanAction(input: { name: string; description: string | null }): Promise<FitnessActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await createWorkoutPlan(caller.client, caller.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/fitness");
  return { ok: true };
}

export async function activatePlanAction(planId: number): Promise<FitnessActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await activateWorkoutPlan(caller.client, caller.userId, planId);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/fitness");
  return { ok: true };
}

export async function addPlanSessionAction(input: {
  planId: number;
  name: string;
  scheduleDays: number[];
}): Promise<FitnessActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await createPlanSession(caller.client, caller.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/fitness");
  return { ok: true };
}

export async function addPlanExerciseAction(input: {
  planSessionId: number;
  exerciseId: number;
  targetSets: number | null;
  targetRepsLow: number | null;
  targetRepsHigh: number | null;
  targetLoad: number | null;
}): Promise<FitnessActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await addPlanSessionExercise(caller.client, caller.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/fitness");
  return { ok: true };
}

/** One set. Opens today's workout if none is open yet -- see `logSet`'s own comment for why
 *  "open" means unconfirmed rather than "exists". */
export async function logSetAction(input: {
  exerciseId: number;
  reps: number | null;
  load: number | null;
  planSessionId: number | null;
}): Promise<FitnessActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await logSet(caller.client, caller.userId, { ...input, localDate: caller.today });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/fitness");
  return { ok: true };
}

export async function deleteSetAction(setId: number): Promise<FitnessActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await deleteSet(caller.client, caller.userId, setId);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/fitness");
  return { ok: true };
}

/** Confirming is what promotes a draft into the week strip and the volume totals. Withdrawing
 *  it is the undo, not an eraser: the sets stay exactly where they are. */
export async function setWorkoutConfirmedAction(
  workoutSessionId: number,
  confirmed: boolean,
): Promise<FitnessActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await setWorkoutConfirmed(caller.client, caller.userId, workoutSessionId, confirmed);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/fitness");
  return { ok: true };
}

export async function logBodyMetricsAction(input: {
  weightLb: number | null;
  waistIn: number | null;
}): Promise<FitnessActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await logBodyMetrics(caller.client, caller.userId, { ...input, localDate: caller.today });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/fitness");
  return { ok: true };
}

/** Takes its date because a cycle explicitly does not have to start today -- someone starting
 *  Ihsan mid-block anchors to the Monday the block actually began. */
export async function setCycleAnchorAction(anchorDate: LocalDate): Promise<FitnessActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await setCycleAnchor(caller.client, caller.userId, anchorDate);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/fitness");
  return { ok: true };
}
