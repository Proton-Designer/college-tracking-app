import {
  clearPrayerStatus,
  getOwnProfile,
  getUserLocalToday,
  loadDeenOverview,
  logQuranSession,
  setPrayerStatus,
  setReflectionIntensity,
  toggleAdhkarPeriod,
  toggleSunnahSlot,
  type AdhkarPeriod,
  type DeenOverview,
  type LogQuranSessionInput,
  type ReflectionIntensity,
  type SunnahSlot,
} from "@collegeos/api";
import type { LocalDate, PrayerName, StoredPrayerStatus } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

/**
 * Mirrors apps/web/src/app/(app)/deen/deenActions.ts one-for-one -- same functions, same
 * argument shapes, called directly against the mobile client instead of through a server
 * action, since mobile has no server layer to route through. Same arrangement as
 * habitsActions/settingsActions on both platforms.
 *
 * Every "today" action re-derives the local date from the profile at call time rather than
 * closing over one the screen rendered with: a screen left open across midnight would
 * otherwise write yesterday's row, and this product is about local days (B4).
 */

export interface DeenActionResult {
  ok: boolean;
  error?: string;
}

export type DeenLoadResult = { ok: true; data: DeenOverview } | { ok: false; error: string };

export async function loadDeen(userId: string): Promise<DeenLoadResult> {
  const client = getMobileSupabaseClient();
  const result = await loadDeenOverview(client, userId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

async function today(): Promise<{ ok: true; value: LocalDate } | { ok: false; error: string }> {
  const client = getMobileSupabaseClient();
  const profile = await getOwnProfile(client);
  if (!profile.ok) return { ok: false, error: profile.error.message };
  return { ok: true, value: getUserLocalToday(profile.data.timezone, new Date()) };
}

/** One tap: on time, qada, or missed. Upserts, so re-tapping a different verdict corrects the
 *  record instead of adding a second one. */
export async function logTodayPrayer(
  userId: string,
  prayerName: PrayerName,
  status: StoredPrayerStatus,
): Promise<DeenActionResult> {
  const date = await today();
  if (!date.ok) return date;
  const client = getMobileSupabaseClient();
  const result = await setPrayerStatus(client, userId, { localDate: date.value, prayerName, status });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** Undo for a mis-tap: removes the record so the prayer returns to whatever the windows
 *  derive -- which, once the window has closed, is `missed` again. Not an eraser. */
export async function clearTodayPrayer(userId: string, prayerName: PrayerName): Promise<DeenActionResult> {
  const date = await today();
  if (!date.ok) return date;
  const client = getMobileSupabaseClient();
  const result = await clearPrayerStatus(client, userId, { localDate: date.value, prayerName });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** The way back, from the backlog. Takes its date because it is explicitly not about today. */
export async function markQadaMadeUp(
  userId: string,
  localDate: LocalDate,
  prayerName: PrayerName,
): Promise<DeenActionResult> {
  const client = getMobileSupabaseClient();
  const result = await setPrayerStatus(client, userId, { localDate, prayerName, status: "qada" });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function toggleSunnah(
  userId: string,
  prayerName: PrayerName,
  slot: SunnahSlot,
): Promise<DeenActionResult> {
  const date = await today();
  if (!date.ok) return date;
  const client = getMobileSupabaseClient();
  const result = await toggleSunnahSlot(client, userId, { localDate: date.value, prayerName, slot });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function toggleAdhkar(userId: string, period: AdhkarPeriod): Promise<DeenActionResult> {
  const date = await today();
  if (!date.ok) return date;
  const client = getMobileSupabaseClient();
  const result = await toggleAdhkarPeriod(client, userId, { localDate: date.value, period });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function logQuran(
  userId: string,
  input: Omit<LogQuranSessionInput, "localDate">,
): Promise<DeenActionResult> {
  const date = await today();
  if (!date.ok) return date;
  const client = getMobileSupabaseClient();
  const result = await logQuranSession(client, userId, { ...input, localDate: date.value });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function setReflection(
  userId: string,
  intensity: ReflectionIntensity,
): Promise<DeenActionResult> {
  const date = await today();
  if (!date.ok) return date;
  const client = getMobileSupabaseClient();
  const result = await setReflectionIntensity(client, userId, { localDate: date.value, intensity });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
