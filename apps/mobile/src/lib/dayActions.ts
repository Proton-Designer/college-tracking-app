import {
  getDay,
  getOwnProfile,
  getUserLocalToday,
  listCompletedHoursInRange,
  listDayFactsInRange,
  setSleepIntent,
  startDay,
  type DayRow,
} from "@collegeos/api";
import { computeDeltaSeconds, countCompletedHours, isDayWon } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

export interface DayState {
  localDate: string;
  day: DayRow | null;
  completedHours: number;
  baselineHours: number;
  dayWon: boolean;
  /**
   * Delta in seconds -- wake to the FIRST completed Hour. Null until both ends exist,
   * never 0, exactly as packages/core defines it. The running "time since wake" the day
   * screen shows before the first Hour lands is a different number and is computed in the
   * UI from `day.wake_at`; it is not this.
   */
  deltaSeconds: number | null;
}

/** Mirrors the `days.baseline_hours` column default, for days with no row yet. */
const DEFAULT_BASELINE_HOURS = 4;

export async function loadDay(
  userId: string,
): Promise<{ ok: true; data: DayState } | { ok: false; error: string }> {
  const client = getMobileSupabaseClient();
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const localDate = getUserLocalToday(profileResult.data.timezone, new Date());

  const [dayResult, hoursResult, factsResult] = await Promise.all([
    getDay(client, userId, localDate),
    listCompletedHoursInRange(client, userId, localDate, localDate),
    listDayFactsInRange(client, userId, localDate, localDate),
  ]);
  if (!dayResult.ok) return { ok: false, error: dayResult.error.message };
  if (!hoursResult.ok) return { ok: false, error: hoursResult.error.message };
  if (!factsResult.ok) return { ok: false, error: factsResult.error.message };

  const completedHours = countCompletedHours(hoursResult.data, localDate);
  const baselineHours = factsResult.data[0]?.baselineHours ?? DEFAULT_BASELINE_HOURS;

  return {
    ok: true,
    data: {
      localDate,
      day: dayResult.data,
      completedHours,
      baselineHours,
      dayWon: isDayWon(completedHours, baselineHours),
      deltaSeconds: computeDeltaSeconds(dayResult.data?.wake_at ?? null, hoursResult.data),
    },
  };
}

export interface DayActionResult {
  ok: boolean;
  error?: string;
}

/** Start Day. Idempotent server-side -- a second tap will not move the wake time. */
export async function startDayAction(userId: string): Promise<DayActionResult> {
  const client = getMobileSupabaseClient();
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const localDate = getUserLocalToday(profileResult.data.timezone, new Date());

  const result = await startDay(client, userId, localDate);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** Closes the day. Used by the Night Plan's close-out step. */
export async function setSleepIntentAction(userId: string): Promise<DayActionResult> {
  const client = getMobileSupabaseClient();
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const localDate = getUserLocalToday(profileResult.data.timezone, new Date());

  const result = await setSleepIntent(client, userId, localDate);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
