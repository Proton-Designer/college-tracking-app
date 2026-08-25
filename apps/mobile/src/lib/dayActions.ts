import {
  getDay,
  getMorningBrief,
  type MorningBrief,
  getOwnProfile,
  getUserLocalToday,
  listCompletedHoursInRange,
  listDayFactsInRange,
  setSleepIntent,
  startDay,
  type DayRow,
} from "@collegeos/api";
import {
  baselineForWeekday,
  computeDeltaSeconds,
  computeEfficiency,
  countCompletedHours,
  isDayWon,
  type EfficiencyResult,
} from "@collegeos/core";
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
  /** Completed Hour time / time awake. `settled` is false until sleep intent closes it. */
  efficiency: EfficiencyResult;
}

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
  // A day with a row keeps its snapshot; a day without one previews what it WILL inherit
  // -- the standing weekday map -- so the number on screen never changes at the moment
  // Start Day happens to write the row.
  const weekdayMap = profileResult.data.weekday_baselines as Record<string, unknown> | null;
  const baselineHours = factsResult.data[0]?.baselineHours ?? baselineForWeekday(weekdayMap, localDate);

  return {
    ok: true,
    data: {
      localDate,
      day: dayResult.data,
      completedHours,
      baselineHours,
      dayWon: isDayWon(completedHours, baselineHours),
      deltaSeconds: computeDeltaSeconds(dayResult.data?.wake_at ?? null, hoursResult.data),
      efficiency: computeEfficiency(
        dayResult.data?.wake_at ?? null,
        dayResult.data?.sleep_intent_at ?? null,
        hoursResult.data,
        new Date(),
      ),
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

  const weekdayMap = profileResult.data.weekday_baselines as Record<string, unknown> | null;
  const result = await startDay(client, userId, localDate, new Date(), baselineForWeekday(weekdayMap, localDate));
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** Closes the day. Used by the Night Plan's close-out step. */
export async function setSleepIntentAction(userId: string): Promise<DayActionResult> {
  const client = getMobileSupabaseClient();
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const localDate = getUserLocalToday(profileResult.data.timezone, new Date());

  const weekdayMap = profileResult.data.weekday_baselines as Record<string, unknown> | null;
  const result = await setSleepIntent(client, userId, localDate, new Date(), baselineForWeekday(weekdayMap, localDate));
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** The Start Day brief. Server-cached per local day; safe to call on every mount. */
export async function loadMorningBrief(
  _userId: string,
): Promise<{ ok: true; data: MorningBrief } | { ok: false; error: string }> {
  const client = getMobileSupabaseClient();
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const localDate = getUserLocalToday(profileResult.data.timezone, new Date());
  const result = await getMorningBrief(client, localDate);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}
