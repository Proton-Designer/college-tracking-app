/**
 * Prayer status, derived at read time.
 *
 * Ported from LifeOS (`lib/deen/prayer-status.ts`, `qada-backlog.ts`, `prayer-consistency.ts`),
 * with its central design intact because it is the same design this codebase already argues for
 * everywhere else: **nothing is written on read.** There is no cron marking prayers missed, so
 * there is no race with a user's tap, no stored status that can drift from the day it describes,
 * and the answer is correct the instant a window closes rather than whenever a job last ran. It is
 * migration 42's rule (derived state cannot drift from its log) applied to a domain where being
 * wrong would be worse than usual.
 *
 * Two rules make it honest, and both are load-bearing:
 *
 * - **A stored status always wins.** The user's own record is the truth; derivation only fills
 *   silence.
 * - **A null window never derives `missed`.** No location set, or a high-latitude date where the
 *   prayer's angle is unreachable, means we do not know — and "we do not know" must never be
 *   rendered as "you failed". This is D40 at the level that matters most.
 */

import type { LocalDate } from '../types';
import { addDays, compareLocalDate } from '../util/date';
import { localDateFromInstant } from '../util/localToday';
import {
  PRAYER_NAMES,
  computePrayerWindows,
  type AsrMadhab,
  type CalcMethod,
  type PrayerName,
  type PrayerWindow,
} from './prayerTimes';

/** What a user can record. `qada` means prayed late — made up, not missed. */
export type StoredPrayerStatus = 'on_time' | 'qada' | 'missed';

/**
 * What a surface renders. The three stored values plus the two that only derivation produces:
 * `upcoming` (the window has not opened) and `pending` (it is open, or we cannot tell).
 */
export type EffectivePrayerStatus = 'upcoming' | 'pending' | 'on_time' | 'qada' | 'missed';

export type ResolvedDayStatuses = Record<PrayerName, EffectivePrayerStatus>;

export interface PrayerRow {
  date: LocalDate;
  prayerName: PrayerName;
  status: StoredPrayerStatus;
}

/**
 * The floor before which nothing is ever derived as missed.
 *
 * `profiles.tracking_started_on` wins when set. A signup date is the wrong floor once history has
 * been cleared: deriving from it would read every day since signup as 5/5 missed and reconstruct
 * exactly the false history the clearing removed. Falls back to the account's own creation date
 * localised to the user's zone.
 *
 * `trackingStartedOn` is already a calendar date and is used as-is. Routing it through a Date would
 * parse it as UTC midnight and shift it a day backwards in any zone behind UTC — the inverse of the
 * B4 bug, and just as wrong.
 */
export function trackingFloor(
  profile: { trackingStartedOn: LocalDate | null; createdAt: string } | null,
  timeZone: string,
  now: Date,
): LocalDate {
  if (profile?.trackingStartedOn) return profile.trackingStartedOn;
  return localDateFromInstant(profile?.createdAt ? new Date(profile.createdAt) : now, timeZone);
}

export function effectivePrayerStatus(
  stored: StoredPrayerStatus | null,
  window: PrayerWindow | null,
  now: Date,
): EffectivePrayerStatus {
  if (stored) return stored;
  if (window === null) return 'pending';
  const nowMs = now.getTime();
  if (nowMs >= Date.parse(window.end)) return 'missed';
  if (nowMs >= Date.parse(window.start)) return 'pending';
  return 'upcoming';
}

export interface ResolveInput {
  rows: PrayerRow[];
  dates: LocalDate[];
  lat: number | null;
  lng: number | null;
  timeZone: string;
  calcMethod: CalcMethod;
  asrMadhab: AsrMadhab;
  now: Date;
  floor: LocalDate;
}

/**
 * The single ripple point. Every consumer of a raw prayer status — the Deen page, the heatmap, the
 * qada backlog, Today's next-prayer row — routes through this rather than re-deriving the rules,
 * so they cannot drift into different answers about the same day.
 *
 * The `definitelyClosed` shortcut is exact rather than an approximation, and it is what makes a
 * 30-day heatmap cheap. Isha's window ends at the *next* day's Fajr, so for any date at or before
 * T-2 every window is structurally closed no matter what the astronomy says: the latest of them
 * ended at that date+1's Fajr, which is at or before T-1. Only T-1 and later can still have an open
 * window relative to now. That collapses a 60-date resolve from ~120 astronomical solves to ~2, and
 * changes zero outputs.
 */
export function resolvePrayerStatuses(input: ResolveInput): Record<LocalDate, ResolvedDayStatuses> {
  const { rows, dates, lat, lng, timeZone, calcMethod, asrMadhab, now, floor } = input;
  const hasLocation = lat != null && lng != null;
  const result: Record<LocalDate, ResolvedDayStatuses> = {};

  const today = localDateFromInstant(now, timeZone);
  const twoDaysAgo = addDays(today, -2);

  // One pass to index the rows. A find() per (date, prayer) is O(days x 5 x rows), which is the
  // kind of quiet quadratic that only shows up once someone has a year of history.
  const stored = new Map<string, StoredPrayerStatus>();
  for (const row of rows) stored.set(`${row.date}:${row.prayerName}`, row.status);

  const windowCache = new Map<LocalDate, Record<PrayerName, PrayerWindow | null>>();

  for (const date of dates) {
    const withinFloor = compareLocalDate(date, floor) >= 0;
    const definitelyClosed = hasLocation && withinFloor && compareLocalDate(date, twoDaysAgo) <= 0;
    const dayResult = {} as ResolvedDayStatuses;

    if (definitelyClosed) {
      for (const name of PRAYER_NAMES) {
        dayResult[name] = stored.get(`${date}:${name}`) ?? 'missed';
      }
    } else {
      let windows: Record<PrayerName, PrayerWindow | null> | null = null;
      if (withinFloor && hasLocation) {
        const cached = windowCache.get(date);
        if (cached) {
          windows = cached;
        } else {
          windows = computePrayerWindows({ date, lat, lng, timeZone, calcMethod, asrMadhab });
          windowCache.set(date, windows);
        }
      }
      for (const name of PRAYER_NAMES) {
        dayResult[name] = effectivePrayerStatus(
          stored.get(`${date}:${name}`) ?? null,
          windows ? windows[name] : null,
          now,
        );
      }
    }

    result[date] = dayResult;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Qada -- the domain's own repair mechanic (D30)
// ---------------------------------------------------------------------------

export interface QadaItem {
  date: LocalDate;
  prayer: PrayerName;
}

/**
 * The itemised backlog: every (date, prayer) since the floor whose effective status is `missed`,
 * most recent first and Fajr..Isha within a date.
 *
 * This is why D30 could drop LifeOS's prayer streak without losing anything. A streak answers "how
 * many days in a row", which resets to zero and cannot be repaid; a backlog answers "what do you
 * owe", which is finite, visible and clearable. Islam supplies the better mechanic, and it happens
 * to be the one D23 would have asked us to build.
 *
 * A pure read of already-resolved statuses. Writes nothing, and never touches `profiles.qada_owed`.
 */
export function buildQadaBacklog(resolved: Record<LocalDate, ResolvedDayStatuses>): {
  items: QadaItem[];
  derivedCount: number;
} {
  const items: QadaItem[] = [];
  for (const date of Object.keys(resolved)) {
    const day = resolved[date]!;
    for (const prayer of PRAYER_NAMES) {
      if (day[prayer] === 'missed') items.push({ date, prayer });
    }
  }
  items.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return PRAYER_NAMES.indexOf(a.prayer) - PRAYER_NAMES.indexOf(b.prayer);
  });
  return { items, derivedCount: items.length };
}

/**
 * Total displayed = the pre-app debt the user hand-tracked (`profiles.qada_owed`) plus what this
 * app derived. Kept separate because the app cannot verify the first and must not silently absorb
 * it into a number it computed.
 */
export function totalQadaOwed(legacyOwed: number, derivedCount: number): number {
  return Math.max(0, legacyOwed) + derivedCount;
}

export interface QadaBuckets {
  last7: QadaItem[];
  earlierThisMonth: QadaItem[];
  older: QadaItem[];
}

/**
 * Splits an already most-recent-first backlog into three non-overlapping buckets for the catch-up
 * view. Each keeps the input's ordering rather than being re-sorted.
 */
export function bucketQadaBacklog(items: QadaItem[], today: LocalDate): QadaBuckets {
  const sevenDaysAgo = addDays(today, -7);
  const thirtyDaysAgo = addDays(today, -30);
  const buckets: QadaBuckets = { last7: [], earlierThisMonth: [], older: [] };
  for (const item of items) {
    if (compareLocalDate(item.date, sevenDaysAgo) >= 0) buckets.last7.push(item);
    else if (compareLocalDate(item.date, thirtyDaysAgo) >= 0) buckets.earlierThisMonth.push(item);
    else buckets.older.push(item);
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// The surfaces that replace the streak (D30)
// ---------------------------------------------------------------------------

/**
 * A day is *cleared* when all five prayers were prayed on time.
 *
 * This is the Day Won shape D23 explicitly kept when it rejected the Chain: a per-day binary
 * against a standard, which nothing later can take away. A day with an unresolvable window is not
 * cleared and is not failed — it is simply not counted, the same way `toDayOutcomes` treats an
 * untracked day.
 */
export function isDayCleared(day: ResolvedDayStatuses): boolean {
  return PRAYER_NAMES.every((name) => day[name] === 'on_time');
}

export interface ConsistencySummary {
  /** Days in the window where all five were on time. */
  clearedDays: number;
  /** Days where every prayer resolved to something recorded or structurally settled. */
  settledDays: number;
  onTime: number;
  qada: number;
  missed: number;
  /** On-time as a share of settled prayers. Null when nothing has settled yet -- never 0. */
  onTimeRate: number | null;
}

/**
 * The Deen headline numbers, over whatever window the caller resolved.
 *
 * `onTimeRate` is null rather than 0 when nothing has settled. A brand-new account showing "0%
 * on time" is a verdict on a user who has not had a chance to pray yet, which is exactly the
 * fabricated measurement D40 exists to prevent.
 */
export function summariseConsistency(
  resolved: Record<LocalDate, ResolvedDayStatuses>,
): ConsistencySummary {
  let clearedDays = 0;
  let settledDays = 0;
  let onTime = 0;
  let qada = 0;
  let missed = 0;

  for (const date of Object.keys(resolved)) {
    const day = resolved[date]!;
    if (isDayCleared(day)) clearedDays += 1;
    const settled = PRAYER_NAMES.every(
      (name) => day[name] === 'on_time' || day[name] === 'qada' || day[name] === 'missed',
    );
    if (settled) settledDays += 1;
    for (const name of PRAYER_NAMES) {
      if (day[name] === 'on_time') onTime += 1;
      else if (day[name] === 'qada') qada += 1;
      else if (day[name] === 'missed') missed += 1;
    }
  }

  const settledPrayers = onTime + qada + missed;
  return {
    clearedDays,
    settledDays,
    onTime,
    qada,
    missed,
    onTimeRate: settledPrayers === 0 ? null : onTime / settledPrayers,
  };
}

/**
 * The 30-day x 5 heatmap, as data. One row per prayer so the grid reads across time, which is the
 * orientation LifeOS uses and the one that makes a pattern in a single prayer visible.
 */
export interface ConsistencyGrid {
  dates: LocalDate[];
  rows: { prayer: PrayerName; cells: EffectivePrayerStatus[] }[];
}

export function buildConsistencyGrid(
  resolved: Record<LocalDate, ResolvedDayStatuses>,
  dates: LocalDate[],
): ConsistencyGrid {
  return {
    dates,
    rows: PRAYER_NAMES.map((prayer) => ({
      prayer,
      cells: dates.map((date) => resolved[date]?.[prayer] ?? 'pending'),
    })),
  };
}

/** Inclusive range of local dates, oldest first. The window every Deen surface reads over. */
export function dateRange(from: LocalDate, to: LocalDate): LocalDate[] {
  const dates: LocalDate[] = [];
  let cursor = from;
  // Bounded so a malformed range cannot spin: no Deen surface reads more than a few years.
  for (let i = 0; i < 4000 && compareLocalDate(cursor, to) <= 0; i += 1) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return dates;
}
