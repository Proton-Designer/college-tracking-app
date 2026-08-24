import type { LocalDate } from '../types';
import type { DayOutcome } from '../bounceback/bounceBack';
import { isoWeekday } from '../util/date';

/**
 * The Deep Work Hour, as domain values rather than database rows -- packages/core knows
 * nothing about Supabase. The API layer maps `task_sessions` rows (hour_index not null,
 * status = 'completed') into these.
 */
export interface CompletedHour {
  /** The local calendar day the Hour belongs to. Always local; never derived from UTC. */
  localDate: LocalDate;
  /** 1-based position within that day. */
  hourIndex: number;
  /** ISO instant the Hour finished. */
  endedAt: string;
  /** Real elapsed minutes, server-computed at end time. */
  minutes: number;
}

/** A day's stored facts, as the Work Engine needs them. Mirrors the `days` table. */
export interface DayFacts {
  localDate: LocalDate;
  /** ISO instant of "Start Day". Null when the day was never started. */
  wakeAt: string | null;
  /** Hours required for this day to be Won. */
  baselineHours: number;
}

/** How many Hours were completed on a given local day. */
export function countCompletedHours(hours: CompletedHour[], date: LocalDate): number {
  return hours.filter((h) => h.localDate === date).length;
}

/**
 * Day Won: the day's baseline was met.
 *
 * A per-day binary against a standard the user set, NOT a streak -- see D23. Nothing here
 * knows or cares what happened yesterday, which is the entire point: winning a day is a
 * statement about that day, and cannot be taken away by a later miss.
 */
export function isDayWon(completedHours: number, baselineHours: number): boolean {
  return completedHours >= baselineHours;
}

/**
 * Delta: wake -> the first Hour *completed*, in seconds. The course's headline race
 * metric, automated.
 *
 * Null, never 0, in every case where the number is unknown: no Start Day tap (no wake
 * time to measure from) or no completed Hour yet (nothing to measure to). This is the same
 * null-vs-zero rule `tasks.planned_start_at` states for start delay, and it matters for
 * exactly the same reason -- a 0 here would read as "won the race instantly" when the
 * truth is "we have no idea".
 *
 * An Hour that finished before the recorded wake time is treated as unknown rather than
 * returned as a negative delta. That combination means the data is wrong (a mis-set wake
 * time, an Hour spanning midnight), and a negative race time is not a fact worth
 * reporting with confidence.
 */
export function computeDeltaSeconds(wakeAt: string | null, hoursForDay: CompletedHour[]): number | null {
  if (wakeAt === null || hoursForDay.length === 0) return null;

  const wakeMs = Date.parse(wakeAt);
  if (Number.isNaN(wakeMs)) return null;

  let earliestMs: number | null = null;
  for (const hour of hoursForDay) {
    const endedMs = Date.parse(hour.endedAt);
    if (Number.isNaN(endedMs)) continue;
    if (earliestMs === null || endedMs < earliestMs) earliestMs = endedMs;
  }
  if (earliestMs === null) return null;
  if (earliestMs < wakeMs) return null;

  return Math.round((earliestMs - wakeMs) / 1000);
}

/**
 * Turns the Work Engine's days into the series `computeBounceBack` already consumes.
 *
 * This is the whole of D23 in one function: there is no chain and no streak counter, so
 * consistency is measured by how fast the user returns after a missed baseline, using the
 * bounce-back engine that already exists and already means exactly that.
 *
 * The 'untracked' case is load-bearing. A day with no Start Day tap and no Hours is a day
 * we know nothing about -- a phone left at home, a day off. `computeBounceBack` treats
 * 'untracked' as a gap that neither opens nor closes a lapse, so classifying it as
 * 'failure' would manufacture lapses out of silence, and classifying it as 'success' would
 * manufacture recoveries. Neither is honest.
 */
export function toDayOutcomes(days: DayFacts[], hours: CompletedHour[]): DayOutcome[] {
  return days.map((day) => {
    const completed = countCompletedHours(hours, day.localDate);
    const observed = day.wakeAt !== null || completed > 0;
    if (!observed) return { date: day.localDate, outcome: 'untracked' };
    return {
      date: day.localDate,
      outcome: isDayWon(completed, day.baselineHours) ? 'success' : 'failure',
    };
  });
}

/**
 * Efficiency: completed Hour time / time awake.
 *
 * The blueprint says "allowed time / time awake", which was genuinely ambiguous, so the
 * definition here is a recorded ruling (2026-08-24) rather than an inference: the
 * numerator is time inside completed Hours, and the denominator runs from the Start Day
 * tap to `sleep_intent_at` -- or to now while the day is still open.
 *
 * `settled` is the part that matters for how this gets displayed. A ratio computed
 * against `now` falls continuously all day simply because the denominator grows, so
 * showing a live figure as though it were the day's result would read as steady decline
 * no matter how well the day went. The flag lets the UI say "so far" until the Night
 * Plan closes the day and the number stops moving.
 *
 * Null, never 0, when there is no wake time: an unstarted day has no denominator, and
 * 0% efficiency is a claim about a day we know nothing about.
 */
export interface EfficiencyResult {
  /** Worked minutes / awake minutes. Null when the day has no wake time. */
  ratio: number | null;
  workedMinutes: number;
  awakeMinutes: number | null;
  /** True once sleep intent has closed the day, i.e. the number is final. */
  settled: boolean;
}

export function computeEfficiency(
  wakeAt: string | null,
  sleepIntentAt: string | null,
  hoursForDay: CompletedHour[],
  now: Date,
): EfficiencyResult {
  const workedMinutes = hoursForDay.reduce((sum, h) => sum + Math.max(0, h.minutes), 0);
  const settled = sleepIntentAt !== null;

  if (wakeAt === null) return { ratio: null, workedMinutes, awakeMinutes: null, settled };

  const wakeMs = Date.parse(wakeAt);
  if (Number.isNaN(wakeMs)) return { ratio: null, workedMinutes, awakeMinutes: null, settled };

  const endMs = sleepIntentAt !== null ? Date.parse(sleepIntentAt) : now.getTime();
  if (Number.isNaN(endMs)) return { ratio: null, workedMinutes, awakeMinutes: null, settled };

  const awakeMinutes = Math.round((endMs - wakeMs) / 60000);
  // A non-positive span means the day is malformed (sleep intent before wake, or a clock
  // that moved). The DB check constraint rejects that ordering, but a client computing
  // against `now` can still see it, and dividing by it would produce a confident lie.
  if (awakeMinutes <= 0) return { ratio: null, workedMinutes, awakeMinutes: null, settled };

  return { ratio: workedMinutes / awakeMinutes, workedMinutes, awakeMinutes, settled };
}

/** The `days.baseline_hours` column default, mirrored -- the one fallback both sides share. */
export const DEFAULT_BASELINE_HOURS = 4;

/**
 * Resolves the day's baseline from the standing per-weekday map
 * (`profiles.weekday_baselines`, ISO weekday number as a string key -> Hours).
 *
 * Defensive about the map's contents on purpose: it is jsonb a future surface might
 * hand-edit, and a malformed entry must degrade to the default rather than poison Day Won
 * -- a baseline of NaN would make every day unwinnable, silently.
 */
export function baselineForWeekday(
  map: Record<string, unknown> | null | undefined,
  date: LocalDate,
  fallback: number = DEFAULT_BASELINE_HOURS,
): number {
  if (map == null) return fallback;
  const raw = map[String(isoWeekday(date))];
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 0) return fallback;
  return raw;
}
