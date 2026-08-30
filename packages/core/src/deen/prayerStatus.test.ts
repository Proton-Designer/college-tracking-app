import { describe, expect, it } from 'vitest';
import {
  bucketQadaBacklog,
  buildConsistencyGrid,
  buildQadaBacklog,
  dateRange,
  effectivePrayerStatus,
  isDayCleared,
  resolvePrayerStatuses,
  summariseConsistency,
  totalQadaOwed,
  trackingFloor,
  type PrayerRow,
  type ResolvedDayStatuses,
} from './prayerStatus';
import { PRAYER_NAMES, computePrayerWindows } from './prayerTimes';

const ARLINGTON = { lat: 32.7357, lng: -97.1081, timeZone: 'America/Chicago' } as const;
const METHOD = { calcMethod: 'isna', asrMadhab: 'standard' } as const;

function allOf(status: ResolvedDayStatuses[keyof ResolvedDayStatuses]): ResolvedDayStatuses {
  return Object.fromEntries(PRAYER_NAMES.map((n) => [n, status])) as ResolvedDayStatuses;
}

describe('effectivePrayerStatus', () => {
  const window = { start: '2026-06-15T10:00:00Z', end: '2026-06-15T14:00:00Z' };

  it('lets a stored status win over any derivation', () => {
    // The user's own record is the truth; derivation only fills silence. A prayer recorded as
    // on-time stays on-time even long after its window closed.
    const wayLater = new Date('2026-06-20T00:00:00Z');
    expect(effectivePrayerStatus('on_time', window, wayLater)).toBe('on_time');
    expect(effectivePrayerStatus('qada', window, wayLater)).toBe('qada');
  });

  it('derives upcoming, pending and missed around the window', () => {
    expect(effectivePrayerStatus(null, window, new Date('2026-06-15T09:00:00Z'))).toBe('upcoming');
    expect(effectivePrayerStatus(null, window, new Date('2026-06-15T12:00:00Z'))).toBe('pending');
    expect(effectivePrayerStatus(null, window, new Date('2026-06-15T15:00:00Z'))).toBe('missed');
  });

  it('never derives missed from a null window', () => {
    // No location set, or a high-latitude date with no computable window. "We do not know" must
    // never render as "you failed" -- this is the single most important line in the module.
    expect(effectivePrayerStatus(null, null, new Date('2030-01-01T00:00:00Z'))).toBe('pending');
  });
});

describe('trackingFloor', () => {
  it('prefers tracking_started_on when set', () => {
    const floor = trackingFloor(
      { trackingStartedOn: '2026-08-01', createdAt: '2025-01-01T00:00:00Z' },
      'America/Chicago',
      new Date('2026-08-30T12:00:00Z'),
    );
    expect(floor).toBe('2026-08-01');
  });

  it('uses it verbatim rather than re-localising it', () => {
    // It is already a calendar date. Parsing it as an instant would read it as UTC midnight and
    // shift it a day backwards in any zone behind UTC -- the inverse of the B4 bug.
    expect(
      trackingFloor({ trackingStartedOn: '2026-08-01', createdAt: '2025-01-01T00:00:00Z' }, 'Pacific/Honolulu', new Date()),
    ).toBe('2026-08-01');
  });

  it('falls back to the account creation date, localised', () => {
    // 02:00Z on the 5th is still the 4th in Chicago.
    expect(
      trackingFloor({ trackingStartedOn: null, createdAt: '2026-08-05T02:00:00Z' }, 'America/Chicago', new Date()),
    ).toBe('2026-08-04');
  });
});

describe('resolvePrayerStatuses', () => {
  const now = new Date('2026-06-15T18:00:00Z'); // 13:00 local in Chicago
  const base = { ...ARLINGTON, ...METHOD, now, floor: '2026-06-01' as const };

  it('derives a settled past day as missed where nothing was recorded', () => {
    const resolved = resolvePrayerStatuses({ ...base, rows: [], dates: ['2026-06-10'] });
    expect(resolved['2026-06-10']).toEqual(allOf('missed'));
  });

  it('never derives missed before the tracking floor', () => {
    // The whole point of the floor: clearing history must not reconstruct a wall of failure.
    const resolved = resolvePrayerStatuses({ ...base, rows: [], dates: ['2026-05-20'] });
    expect(resolved['2026-05-20']).toEqual(allOf('pending'));
  });

  it('never derives missed when no location is set', () => {
    const resolved = resolvePrayerStatuses({
      ...base,
      lat: null,
      lng: null,
      rows: [],
      dates: ['2026-06-10'],
    });
    expect(resolved['2026-06-10']).toEqual(allOf('pending'));
  });

  it('mixes stored records with derivation on the same day', () => {
    const rows: PrayerRow[] = [
      { date: '2026-06-10', prayerName: 'fajr', status: 'on_time' },
      { date: '2026-06-10', prayerName: 'asr', status: 'qada' },
    ];
    const resolved = resolvePrayerStatuses({ ...base, rows, dates: ['2026-06-10'] });
    expect(resolved['2026-06-10']!.fajr).toBe('on_time');
    expect(resolved['2026-06-10']!.asr).toBe('qada');
    expect(resolved['2026-06-10']!.isha).toBe('missed');
  });

  it('splits today into what has passed and what has not', () => {
    const resolved = resolvePrayerStatuses({ ...base, rows: [], dates: ['2026-06-15'] });
    const day = resolved['2026-06-15']!;
    // 13:00 local: Fajr's window has closed, Isha's has not opened.
    expect(day.fajr).toBe('missed');
    expect(day.isha).toBe('upcoming');
  });

  it('agrees with the astronomy it short-circuits', () => {
    // The T-2 shortcut claims to be exact rather than an approximation. This proves it: a date old
    // enough to take the shortcut resolves the same as one computed the slow way through real
    // windows.
    const date = '2026-06-10';
    const windows = computePrayerWindows({ date, ...ARLINGTON, ...METHOD });
    const slowPath = Object.fromEntries(
      PRAYER_NAMES.map((n) => [n, effectivePrayerStatus(null, windows[n], now)]),
    );
    const fastPath = resolvePrayerStatuses({ ...base, rows: [], dates: [date] })[date];
    expect(fastPath).toEqual(slowPath);
  });

  it('resolves a 60-day window without choking', () => {
    const dates = dateRange('2026-04-17', '2026-06-15');
    expect(dates).toHaveLength(60);
    const resolved = resolvePrayerStatuses({ ...base, rows: [], dates });
    expect(Object.keys(resolved)).toHaveLength(60);
  });
});

describe('the qada backlog -- D30', () => {
  const resolved: Record<string, ResolvedDayStatuses> = {
    '2026-06-01': { ...allOf('on_time'), fajr: 'missed' },
    '2026-06-10': { ...allOf('on_time'), isha: 'missed', asr: 'missed' },
    '2026-06-14': allOf('on_time'),
  };

  it('itemises every missed prayer, most recent first', () => {
    const { items, derivedCount } = buildQadaBacklog(resolved);
    expect(derivedCount).toBe(3);
    expect(items[0]).toEqual({ date: '2026-06-10', prayer: 'asr' });
    expect(items[1]).toEqual({ date: '2026-06-10', prayer: 'isha' });
    expect(items[2]).toEqual({ date: '2026-06-01', prayer: 'fajr' });
  });

  it('treats a made-up prayer as repaid, not owed', () => {
    // qada IS the repair. A prayer marked qada must leave the backlog, or the mechanic never
    // resolves and the number only ever grows.
    const repaid = { '2026-06-10': { ...allOf('on_time'), isha: 'qada' as const } };
    expect(buildQadaBacklog(repaid).derivedCount).toBe(0);
  });

  it('keeps the hand-tracked pre-app debt separate from what it derived', () => {
    expect(totalQadaOwed(40, 3)).toBe(43);
    // A negative stored value is data corruption, not a credit against real misses.
    expect(totalQadaOwed(-5, 3)).toBe(3);
  });

  it('buckets by recency for the catch-up view', () => {
    const { items } = buildQadaBacklog(resolved);
    const buckets = bucketQadaBacklog(items, '2026-06-15');
    expect(buckets.last7.map((i) => i.date)).toEqual(['2026-06-10', '2026-06-10']);
    expect(buckets.earlierThisMonth.map((i) => i.date)).toEqual(['2026-06-01']);
    expect(buckets.older).toEqual([]);
  });
});

describe('what replaces the streak', () => {
  it('clears a day only when all five were on time', () => {
    expect(isDayCleared(allOf('on_time'))).toBe(true);
    expect(isDayCleared({ ...allOf('on_time'), isha: 'qada' })).toBe(false);
    expect(isDayCleared({ ...allOf('on_time'), isha: 'pending' })).toBe(false);
  });

  it('summarises without inventing a rate out of nothing', () => {
    // A brand-new account showing "0% on time" is a verdict on someone who has not had a chance
    // to pray yet.
    const nothingSettled = summariseConsistency({ '2026-06-15': allOf('upcoming') });
    expect(nothingSettled.onTimeRate).toBeNull();
    expect(nothingSettled.clearedDays).toBe(0);
  });

  it('counts cleared days and the on-time rate over settled prayers only', () => {
    const summary = summariseConsistency({
      '2026-06-13': allOf('on_time'),
      '2026-06-14': { ...allOf('on_time'), fajr: 'missed' },
      '2026-06-15': allOf('upcoming'),
    });
    expect(summary.clearedDays).toBe(1);
    expect(summary.settledDays).toBe(2);
    expect(summary.onTime).toBe(9);
    expect(summary.missed).toBe(1);
    expect(summary.onTimeRate).toBeCloseTo(0.9);
  });

  it('is unaffected by day order, since nothing here is consecutive', () => {
    // D30's whole claim: none of these numbers depend on adjacency, so no reordering or gap can
    // reset them the way a streak would.
    const a = summariseConsistency({ '2026-06-01': allOf('on_time'), '2026-06-09': allOf('on_time') });
    const b = summariseConsistency({ '2026-06-01': allOf('on_time'), '2026-06-02': allOf('on_time') });
    expect(a.clearedDays).toBe(b.clearedDays);
    expect(a.onTimeRate).toBe(b.onTimeRate);
  });
});

describe('buildConsistencyGrid', () => {
  it('lays out one row per prayer across the dates given', () => {
    const dates = dateRange('2026-06-13', '2026-06-15');
    const grid = buildConsistencyGrid(
      { '2026-06-13': allOf('on_time'), '2026-06-14': allOf('missed') },
      dates,
    );
    expect(grid.rows).toHaveLength(5);
    expect(grid.rows[0]!.prayer).toBe('fajr');
    expect(grid.rows[0]!.cells).toEqual(['on_time', 'missed', 'pending']);
  });

  it('renders a date with no resolution as pending rather than dropping the column', () => {
    // A gap in the grid would silently change what the heatmap is a picture of.
    const grid = buildConsistencyGrid({}, dateRange('2026-06-14', '2026-06-15'));
    expect(grid.rows.every((r) => r.cells.length === 2)).toBe(true);
  });
});
