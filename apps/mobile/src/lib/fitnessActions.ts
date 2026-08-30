import {
  activateWorkoutPlan,
  addPlanSessionExercise,
  createExercise,
  createPlanSession,
  createWorkoutPlan,
  deleteSet,
  getOwnProfile,
  getUserLocalToday,
  loadFitnessOverview,
  logBodyMetrics,
  logSet,
  setCycleAnchor,
  setExerciseActive,
  setWorkoutConfirmed,
  type FitnessOverview,
  type MuscleGroupValue,
} from "@collegeos/api";
import type { LocalDate } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

/**
 * Mirrors apps/web/src/app/(app)/fitness/fitnessActions.ts one-for-one -- same functions, same
 * argument shapes, called directly against the mobile client instead of through a server
 * action, since mobile has no server layer to route through. Same arrangement as
 * deenActions/habitsActions on both platforms.
 *
 * Every "today" action re-derives the local date from the profile at call time rather than
 * closing over one the screen rendered with: a screen left open across midnight would
 * otherwise log tonight's sets onto yesterday's workout, and this product is about local days
 * (B4).
 */

export interface FitnessActionResult {
  ok: boolean;
  error?: string;
}

export type FitnessLoadResult = { ok: true; data: FitnessOverview } | { ok: false; error: string };

export async function loadFitness(userId: string): Promise<FitnessLoadResult> {
  const client = getMobileSupabaseClient();
  const result = await loadFitnessOverview(client, userId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

async function today(): Promise<{ ok: true; value: LocalDate } | { ok: false; error: string }> {
  const client = getMobileSupabaseClient();
  const profile = await getOwnProfile(client);
  if (!profile.ok) return { ok: false, error: profile.error.message };
  return { ok: true, value: getUserLocalToday(profile.data.timezone, new Date()) };
}

export async function addExercise(
  userId: string,
  input: { name: string; primaryMuscles: MuscleGroupValue[]; secondaryMuscles: MuscleGroupValue[] },
): Promise<FitnessActionResult> {
  const client = getMobileSupabaseClient();
  const result = await createExercise(client, userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** Retire a movement, or bring it back. Never a delete -- a logged set pointing at a vanished
 *  exercise would corrupt every historical volume number. */
export async function setExerciseRetired(
  userId: string,
  exerciseId: number,
  active: boolean,
): Promise<FitnessActionResult> {
  const client = getMobileSupabaseClient();
  const result = await setExerciseActive(client, userId, exerciseId, active);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function createPlan(userId: string, name: string): Promise<FitnessActionResult> {
  const client = getMobileSupabaseClient();
  const result = await createWorkoutPlan(client, userId, { name, description: null });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function activatePlan(userId: string, planId: number): Promise<FitnessActionResult> {
  const client = getMobileSupabaseClient();
  const result = await activateWorkoutPlan(client, userId, planId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function addPlanSession(
  userId: string,
  input: { planId: number; name: string; scheduleDays: number[] },
): Promise<FitnessActionResult> {
  const client = getMobileSupabaseClient();
  const result = await createPlanSession(client, userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function addPlanExercise(
  userId: string,
  input: {
    planSessionId: number;
    exerciseId: number;
    targetSets: number | null;
    targetRepsLow: number | null;
    targetRepsHigh: number | null;
    targetLoad: number | null;
  },
): Promise<FitnessActionResult> {
  const client = getMobileSupabaseClient();
  const result = await addPlanSessionExercise(client, userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** One set. Opens today's workout if none is open yet -- "open" means unconfirmed, so a set
 *  logged after a confirmation starts a second workout rather than editing a closed one. */
export async function logOneSet(
  userId: string,
  input: { exerciseId: number; reps: number | null; load: number | null; planSessionId: number | null },
): Promise<FitnessActionResult> {
  const date = await today();
  if (!date.ok) return date;
  const client = getMobileSupabaseClient();
  const result = await logSet(client, userId, { ...input, localDate: date.value });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function removeSet(userId: string, setId: number): Promise<FitnessActionResult> {
  const client = getMobileSupabaseClient();
  const result = await deleteSet(client, userId, setId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** Confirming promotes a draft into the week strip and the volume totals. Withdrawing it is
 *  the undo, not an eraser: the sets stay exactly where they are. */
export async function confirmWorkout(
  userId: string,
  workoutSessionId: number,
  confirmed: boolean,
): Promise<FitnessActionResult> {
  const client = getMobileSupabaseClient();
  const result = await setWorkoutConfirmed(client, userId, workoutSessionId, confirmed);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function recordBodyMetrics(
  userId: string,
  input: { weightLb: number | null; waistIn: number | null },
): Promise<FitnessActionResult> {
  const date = await today();
  if (!date.ok) return date;
  const client = getMobileSupabaseClient();
  const result = await logBodyMetrics(client, userId, { ...input, localDate: date.value });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** Takes its date because a cycle explicitly does not have to start today. */
export async function startCycle(userId: string, anchorDate: LocalDate): Promise<FitnessActionResult> {
  const client = getMobileSupabaseClient();
  const result = await setCycleAnchor(client, userId, anchorDate);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
