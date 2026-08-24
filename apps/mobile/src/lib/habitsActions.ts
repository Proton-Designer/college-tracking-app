import {
  countHabitVotes,
  createHabit,
  getOwnProfile,
  getUserLocalToday,
  listHabitLogsInRange,
  listHabits,
  listVotesForDate,
  setHabitVote,
  updateHabit,
  type HabitRow,
} from "@collegeos/api";
import {
  addDays,
  compareLocalDate,
  computeHabitScore,
  isScheduledOn,
  localDateFromInstant,
  type HabitSchedule,
} from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

/**
 * How far back the score replays. Sixty days is enough for the decay/recovery dynamics to
 * express themselves without the replay cost growing with account age; votes stay all-time
 * via a separate count.
 */
const SCORE_WINDOW_DAYS = 60;

export interface HabitState {
  habit: HabitRow;
  score: number;
  observedDays: number;
  votes: number;
  /** null = today unanswered; true/false = today's explicit vote. */
  todayVote: boolean | null;
  scheduledToday: boolean;
}

export interface HabitsActionResult {
  ok: boolean;
  error?: string;
}

function scheduleOf(habit: HabitRow): HabitSchedule {
  const raw = habit.schedule as { weekdays?: unknown } | null;
  const weekdays = Array.isArray(raw?.weekdays) ? raw.weekdays.filter((n): n is number => typeof n === "number") : [];
  return { weekdays };
}

export async function loadHabits(
  userId: string,
): Promise<{ ok: true; data: { localDate: string; habits: HabitState[] } } | { ok: false; error: string }> {
  const client = getMobileSupabaseClient();
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const tz = profileResult.data.timezone;
  const today = getUserLocalToday(tz, new Date());

  const habitsResult = await listHabits(client, userId);
  if (!habitsResult.ok) return { ok: false, error: habitsResult.error.message };

  const votesToday = await listVotesForDate(client, userId, today);
  if (!votesToday.ok) return { ok: false, error: votesToday.error.message };
  const todayByHabit = new Map(votesToday.data.map((v) => [v.habit_id, v.done]));

  const states: HabitState[] = [];
  for (const habit of habitsResult.data) {
    const schedule = scheduleOf(habit);
    // The replay must not start before the habit existed: a habit created yesterday
    // replayed over sixty days would count fifty-nine pre-creation days as misses and
    // report a floor score on day one. Creation date is derived in the USER'S timezone --
    // the same instant is a different calendar day in different zones, and this product's
    // rule is that day boundaries are always local.
    const createdLocal = localDateFromInstant(new Date(habit.created_at), tz);
    const windowStart = addDays(today, -(SCORE_WINDOW_DAYS - 1));
    const fromDate = compareLocalDate(createdLocal, windowStart) > 0 ? createdLocal : windowStart;

    const logs = await listHabitLogsInRange(client, userId, habit.id, fromDate, today);
    if (!logs.ok) return { ok: false, error: logs.error.message };
    const votes = await countHabitVotes(client, userId, habit.id);
    if (!votes.ok) return { ok: false, error: votes.error.message };

    const { score, observedDays } = computeHabitScore(logs.data, schedule, fromDate, today, habit.paused);
    states.push({
      habit,
      score,
      observedDays,
      votes: votes.data,
      todayVote: todayByHabit.get(habit.id) ?? null,
      scheduledToday: isScheduledOn(schedule, today),
    });
  }

  return { ok: true, data: { localDate: today, habits: states } };
}

/** Casts today's vote. Tapping an already-cast vote retracts it (sets done:false). */
export async function voteAction(userId: string, habitId: number, done: boolean): Promise<HabitsActionResult> {
  const client = getMobileSupabaseClient();
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const today = getUserLocalToday(profileResult.data.timezone, new Date());

  const result = await setHabitVote(client, userId, habitId, today, done);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function addHabitAction(
  userId: string,
  input: { name: string; identity: string; whyCard?: string },
): Promise<HabitsActionResult> {
  const client = getMobileSupabaseClient();
  const result = await createHabit(client, userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function setHabitPaused(userId: string, habitId: number, paused: boolean): Promise<HabitsActionResult> {
  const client = getMobileSupabaseClient();
  const result = await updateHabit(client, userId, habitId, { paused });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function retireHabit(userId: string, habitId: number): Promise<HabitsActionResult> {
  const client = getMobileSupabaseClient();
  const result = await updateHabit(client, userId, habitId, { active: false });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
