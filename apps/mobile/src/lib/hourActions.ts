import {
  completeFocusSession,
  getActiveFocusSession,
  getOwnProfile,
  getUserLocalToday,
  listCompletedHoursInRange,
  listDayFactsInRange,
  listDistractionsForSession,
  logDistraction,
  startHour,
  type DistractionCause,
  type DistractionRow,
  type TaskSessionRow,
} from "@collegeos/api";
import { baselineForWeekday, countCompletedHours, isDayWon } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

export interface HourActionResult {
  ok: boolean;
  error?: string;
}

export interface StartHourResult extends HourActionResult {
  session?: TaskSessionRow;
}

/**
 * Starts an Hour. The local day comes from the user's own profile timezone via
 * getUserLocalToday -- never a client-side UTC guess, the same rule every other write
 * path in this app follows (see deliverableActions).
 */
export async function startHourAction(
  userId: string,
  input: { deliverable: string; category: string | null; mode?: import("./modes").HourMode },
): Promise<StartHourResult> {
  const client = getMobileSupabaseClient();
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };

  const localDate = getUserLocalToday(profileResult.data.timezone, new Date());
  const result = await startHour(client, userId, {
    deliverable: input.deliverable,
    localDate,
    ...(input.category != null ? { category: input.category } : {}),
    ...(input.mode != null ? { mode: input.mode } : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, session: result.data };
}

/** One +1 Distraction tap. The counter column is maintained by a DB trigger, not here. */
export async function logDistractionAction(
  userId: string,
  sessionId: number,
  cause: DistractionCause,
): Promise<HourActionResult> {
  const client = getMobileSupabaseClient();
  const result = await logDistraction(client, userId, sessionId, cause);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/**
 * Ends the Hour. `actual_duration_min` is computed server-side from the stored
 * actual_start -- the client never asserts how long it worked, which is what keeps a
 * backgrounded or killed app from under-reporting an Hour.
 */
export async function endHourAction(
  userId: string,
  sessionId: number,
  input: { subjectiveFocus?: number; objectiveOutput?: string },
): Promise<HourActionResult> {
  const client = getMobileSupabaseClient();
  const result = await completeFocusSession(client, userId, { sessionId, ...input });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export interface ActiveHourState {
  session: TaskSessionRow | null;
  distractions: DistractionRow[];
}

/**
 * What the timer screen resumes from on mount or foreground. Reads the stored
 * actual_start so elapsed time is always re-derived from wall clock rather than a JS
 * interval that stopped when the app was backgrounded.
 */
export async function loadActiveHour(userId: string): Promise<
  { ok: true; data: ActiveHourState } | { ok: false; error: string }
> {
  const client = getMobileSupabaseClient();
  const active = await getActiveFocusSession(client, userId);
  if (!active.ok) return { ok: false, error: active.error.message };
  if (active.data == null) return { ok: true, data: { session: null, distractions: [] } };

  const distractions = await listDistractionsForSession(client, userId, active.data.id);
  if (!distractions.ok) return { ok: false, error: distractions.error.message };
  return { ok: true, data: { session: active.data, distractions: distractions.data } };
}

export interface TodayHoursState {
  localDate: string;
  completedHours: number;
  baselineHours: number;
  dayWon: boolean;
}

/**
 * Today's Hour count against the day's baseline. Day Won is computed by packages/core's
 * isDayWon, not re-derived here -- there is one definition of winning a day.
 *
 * A day with no `days` row yet reports the default baseline rather than failing: the row
 * is created by Start Day, and an Hour can legitimately be logged before that tap.
 */
export async function loadTodayHours(
  userId: string,
): Promise<{ ok: true; data: TodayHoursState } | { ok: false; error: string }> {
  const client = getMobileSupabaseClient();
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const localDate = getUserLocalToday(profileResult.data.timezone, new Date());

  const hours = await listCompletedHoursInRange(client, userId, localDate, localDate);
  if (!hours.ok) return { ok: false, error: hours.error.message };
  const facts = await listDayFactsInRange(client, userId, localDate, localDate);
  if (!facts.ok) return { ok: false, error: facts.error.message };

  const completedHours = countCompletedHours(hours.data, localDate);
  const baselineHours =
    facts.data[0]?.baselineHours ??
    baselineForWeekday(profileResult.data.weekday_baselines as Record<string, unknown> | null, localDate);
  return {
    ok: true,
    data: { localDate, completedHours, baselineHours, dayWon: isDayWon(completedHours, baselineHours) },
  };
}

