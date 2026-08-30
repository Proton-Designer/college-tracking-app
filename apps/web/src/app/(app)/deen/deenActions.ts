"use server";

import { revalidatePath } from "next/cache";
import {
  clearPrayerStatus,
  getOwnProfile,
  getUserLocalToday,
  logQuranSession,
  setPrayerStatus,
  setReflectionIntensity,
  toggleAdhkarPeriod,
  toggleSunnahSlot,
  type AdhkarPeriod,
  type LogQuranSessionInput,
  type ReflectionIntensity,
  type SunnahSlot,
} from "@collegeos/api";
import type { LocalDate, PrayerName, StoredPrayerStatus } from "@collegeos/core";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Server actions for /deen. Mirrored one-for-one by apps/mobile/src/lib/deenActions.ts, which
 * calls the same `@collegeos/api` functions directly (mobile has no server layer to route
 * through) -- the same arrangement habitsActions uses on both platforms.
 *
 * Every "today" action derives the local date on the server rather than trusting one from the
 * client. A page rendered at 23:58 and tapped at 00:01 would otherwise write yesterday's row,
 * and the whole product is about local days (B4).
 */

export interface DeenActionResult {
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

/** One tap: on time, qada, or missed. Upserts, so re-tapping a different verdict corrects
 *  the record instead of adding a second one. */
export async function logTodayPrayerAction(
  prayerName: PrayerName,
  status: StoredPrayerStatus,
): Promise<DeenActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await setPrayerStatus(caller.client, caller.userId, {
    localDate: caller.today,
    prayerName,
    status,
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/deen");
  return { ok: true };
}

/** Undo for a mis-tap. Removes the record so the prayer goes back to whatever the windows
 *  derive -- which, once the window has closed, is `missed` again. Not an eraser. */
export async function clearTodayPrayerAction(prayerName: PrayerName): Promise<DeenActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await clearPrayerStatus(caller.client, caller.userId, { localDate: caller.today, prayerName });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/deen");
  return { ok: true };
}

/** The way back, from the backlog: a past prayer marked as made up. Takes its date because
 *  it is explicitly not about today. */
export async function markQadaMadeUpAction(
  localDate: LocalDate,
  prayerName: PrayerName,
): Promise<DeenActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await setPrayerStatus(caller.client, caller.userId, { localDate, prayerName, status: "qada" });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/deen");
  return { ok: true };
}

export async function toggleSunnahAction(prayerName: PrayerName, slot: SunnahSlot): Promise<DeenActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await toggleSunnahSlot(caller.client, caller.userId, {
    localDate: caller.today,
    prayerName,
    slot,
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/deen");
  return { ok: true };
}

export async function toggleAdhkarAction(period: AdhkarPeriod): Promise<DeenActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await toggleAdhkarPeriod(caller.client, caller.userId, { localDate: caller.today, period });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/deen");
  return { ok: true };
}

export async function logQuranSessionAction(
  input: Omit<LogQuranSessionInput, "localDate">,
): Promise<DeenActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await logQuranSession(caller.client, caller.userId, { ...input, localDate: caller.today });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/deen");
  return { ok: true };
}

export async function setReflectionAction(intensity: ReflectionIntensity): Promise<DeenActionResult> {
  const caller = await requireCaller();
  if (!caller.ok) return caller;
  const result = await setReflectionIntensity(caller.client, caller.userId, {
    localDate: caller.today,
    intensity,
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/deen");
  return { ok: true };
}
