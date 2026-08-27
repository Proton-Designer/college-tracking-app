import Link from "next/link";
import {
  countHabitVotes,
  getOwnProfile,
  getUserLocalToday,
  listHabitLogsInRange,
  listHabits,
  listVotesForDate,
  type HabitRow,
  type TypedSupabaseClient,
} from "@collegeos/api";
import {
  addDays,
  compareLocalDate,
  computeHabitScore,
  isScheduledOn,
  localDateFromInstant,
  type HabitSchedule,
} from "@collegeos/core";
import { Aurora, PageHeader } from "@/components/ui";
import { HabitsClient } from "@/components/habits/HabitsClient";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The Habits screen, web port — BLUEPRINT Part IV-D. Identity votes, decaying scores,
 * capped at seven (`@collegeos/api`'s `MAX_ACTIVE_HABITS`, enforced by `createHabit`).
 */

/** How far back the score replays. Mirrors apps/mobile/src/lib/habitsActions.ts exactly --
 *  sixty days is enough for the decay/recovery dynamics to express themselves without the
 *  replay cost growing with account age; votes stay all-time via a separate count. */
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

function scheduleOf(habit: HabitRow): HabitSchedule {
  const raw = habit.schedule as { weekdays?: unknown } | null;
  const weekdays = Array.isArray(raw?.weekdays) ? raw.weekdays.filter((n): n is number => typeof n === "number") : [];
  return { weekdays };
}

/**
 * All scoring math is `@collegeos/core`'s `computeHabitScore` -- this function only fetches
 * and assembles. Kept identical to mobile's `loadHabits` so the two platforms can never
 * silently diverge on what a habit's score means (Law 2).
 */
async function loadHabitStates(
  client: TypedSupabaseClient,
  userId: string,
): Promise<{ ok: true; data: HabitState[] } | { ok: false; error: string }> {
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
    // The replay must not start before the habit existed -- see mobile's loadHabits for the
    // full reasoning; kept verbatim here rather than re-derived.
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

  return { ok: true, data: states };
}

export default async function HabitsPage() {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-3 px-8 py-12">
        <p className="text-body text-ink-muted">Not signed in.</p>
      </main>
    );
  }

  const statesResult = await loadHabitStates(client, user.id);
  if (!statesResult.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load Habits</p>
        <p className="text-body text-ink-muted">{statesResult.error}</p>
        <Link href="/today" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to Today
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-report flex-1 flex-col gap-8 px-8 py-10">
      <Aurora band={null} />
      <PageHeader
        title="Habits"
        context="Each check-in is a vote for who you're becoming. Seven max, on purpose."
      />
      <HabitsClient initialStates={statesResult.data} />
    </main>
  );
}
