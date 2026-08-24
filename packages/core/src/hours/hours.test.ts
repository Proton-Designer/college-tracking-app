import { describe, expect, it } from 'vitest';
import { computeBounceBack } from '../bounceback/bounceBack';
import {
  computeDeltaSeconds,
  computeEfficiency,
  countCompletedHours,
  isDayWon,
  toDayOutcomes,
  type CompletedHour,
  type DayFacts,
} from './hours';

const hour = (localDate: string, hourIndex: number, endedAt: string, minutes = 60): CompletedHour => ({
  localDate,
  hourIndex,
  endedAt,
  minutes,
});

describe('countCompletedHours', () => {
  const hours = [
    hour('2026-08-24', 1, '2026-08-24T14:00:00Z'),
    hour('2026-08-24', 2, '2026-08-24T16:00:00Z'),
    hour('2026-08-25', 1, '2026-08-25T14:00:00Z'),
  ];

  it('counts only the requested local day', () => {
    expect(countCompletedHours(hours, '2026-08-24')).toBe(2);
    expect(countCompletedHours(hours, '2026-08-25')).toBe(1);
  });

  it('returns 0 for a day with no Hours rather than throwing', () => {
    expect(countCompletedHours(hours, '2026-08-26')).toBe(0);
  });
});

describe('isDayWon', () => {
  it('is won at exactly the baseline, not only above it', () => {
    expect(isDayWon(4, 4)).toBe(true);
  });

  it('is not won below the baseline', () => {
    expect(isDayWon(3, 4)).toBe(false);
  });

  it('counts extra Hours as still won -- bonus never un-wins a day', () => {
    expect(isDayWon(6, 4)).toBe(true);
  });

  it('treats a zero baseline as won (a deliberate rest day is not a failure)', () => {
    expect(isDayWon(0, 0)).toBe(true);
  });
});

describe('computeDeltaSeconds', () => {
  const wake = '2026-08-24T12:00:00Z';

  it('measures wake to the FIRST completed Hour, not the last', () => {
    const hours = [
      hour('2026-08-24', 2, '2026-08-24T16:00:00Z'),
      hour('2026-08-24', 1, '2026-08-24T13:30:00Z'),
    ];
    expect(computeDeltaSeconds(wake, hours)).toBe(90 * 60);
  });

  it('is null, never 0, when the day was never started', () => {
    expect(computeDeltaSeconds(null, [hour('2026-08-24', 1, '2026-08-24T13:00:00Z')])).toBeNull();
  });

  it('is null, never 0, when no Hour has completed yet', () => {
    expect(computeDeltaSeconds(wake, [])).toBeNull();
  });

  it('is null rather than negative when an Hour predates the recorded wake time', () => {
    // Bad data (mis-set wake time, or an Hour spanning midnight). A negative race time is
    // not a fact worth reporting.
    expect(computeDeltaSeconds(wake, [hour('2026-08-24', 1, '2026-08-24T11:00:00Z')])).toBeNull();
  });

  it('is 0 only for the genuine edge case of an Hour completing at the wake instant', () => {
    expect(computeDeltaSeconds(wake, [hour('2026-08-24', 1, wake)])).toBe(0);
  });

  it('is null on an unparseable wake time rather than NaN', () => {
    expect(computeDeltaSeconds('not-a-date', [hour('2026-08-24', 1, '2026-08-24T13:00:00Z')])).toBeNull();
  });

  it('ignores unparseable Hour timestamps instead of poisoning the result', () => {
    const hours = [hour('2026-08-24', 1, 'garbage'), hour('2026-08-24', 2, '2026-08-24T13:00:00Z')];
    expect(computeDeltaSeconds(wake, hours)).toBe(60 * 60);
  });
});

describe('toDayOutcomes', () => {
  const days = (...rows: Array<[string, string | null, number]>): DayFacts[] =>
    rows.map(([localDate, wakeAt, baselineHours]) => ({ localDate, wakeAt, baselineHours }));

  it('marks a day that met its baseline as success', () => {
    const out = toDayOutcomes(days(['2026-08-24', '2026-08-24T12:00:00Z', 2]), [
      hour('2026-08-24', 1, '2026-08-24T14:00:00Z'),
      hour('2026-08-24', 2, '2026-08-24T16:00:00Z'),
    ]);
    expect(out).toEqual([{ date: '2026-08-24', outcome: 'success' }]);
  });

  it('marks a started-but-short day as failure', () => {
    const out = toDayOutcomes(days(['2026-08-24', '2026-08-24T12:00:00Z', 4]), [
      hour('2026-08-24', 1, '2026-08-24T14:00:00Z'),
    ]);
    expect(out).toEqual([{ date: '2026-08-24', outcome: 'failure' }]);
  });

  it('marks a day with no Start Day and no Hours as untracked, NOT failure', () => {
    // Manufacturing a lapse out of silence is the specific dishonesty this guards.
    const out = toDayOutcomes(days(['2026-08-24', null, 4]), []);
    expect(out).toEqual([{ date: '2026-08-24', outcome: 'untracked' }]);
  });

  it('counts a day as observed if Hours exist even without a Start Day tap', () => {
    const out = toDayOutcomes(days(['2026-08-24', null, 4]), [hour('2026-08-24', 1, '2026-08-24T14:00:00Z')]);
    expect(out).toEqual([{ date: '2026-08-24', outcome: 'failure' }]);
  });

  it('counts a started day with zero Hours as observed failure, not untracked', () => {
    const out = toDayOutcomes(days(['2026-08-24', '2026-08-24T12:00:00Z', 4]), []);
    expect(out).toEqual([{ date: '2026-08-24', outcome: 'failure' }]);
  });

  it('feeds computeBounceBack, which is what replaces the chain (D23)', () => {
    // Won, missed, missed, recovered -> exactly one closed lapse episode.
    const out = toDayOutcomes(
      days(
        ['2026-08-20', '2026-08-20T12:00:00Z', 1],
        ['2026-08-21', '2026-08-21T12:00:00Z', 1],
        ['2026-08-22', '2026-08-22T12:00:00Z', 1],
        ['2026-08-23', '2026-08-23T12:00:00Z', 1],
      ),
      [hour('2026-08-20', 1, '2026-08-20T14:00:00Z'), hour('2026-08-23', 1, '2026-08-23T14:00:00Z')],
    );
    expect(out.map((o) => o.outcome)).toEqual(['success', 'failure', 'failure', 'success']);

    const bounce = computeBounceBack(out);
    expect(bounce.closedEpisodeCount).toBe(1);
    expect(bounce.ongoingLapseDays).toBe(0);
  });

  it('leaves an unresolved lapse open rather than reporting a recovery', () => {
    const out = toDayOutcomes(
      days(['2026-08-22', '2026-08-22T12:00:00Z', 1], ['2026-08-23', '2026-08-23T12:00:00Z', 1]),
      [],
    );
    const bounce = computeBounceBack(out);
    expect(bounce.closedEpisodeCount).toBe(0);
    expect(bounce.ongoingLapseDays).toBeGreaterThan(0);
  });
});

describe('computeEfficiency', () => {
  const wake = '2026-08-24T12:00:00Z';
  const now = new Date('2026-08-24T20:00:00Z'); // 8h awake so far

  it('divides completed Hour time by time awake, running against now while open', () => {
    const result = computeEfficiency(wake, null, [hour('2026-08-24', 1, 'x'), hour('2026-08-24', 2, 'x')], now);
    expect(result.workedMinutes).toBe(120);
    expect(result.awakeMinutes).toBe(480);
    expect(result.ratio).toBeCloseTo(0.25);
    expect(result.settled).toBe(false);
  });

  it('closes the number against sleep intent, ignoring now, once the day is closed', () => {
    const sleep = '2026-08-24T18:00:00Z'; // 6h awake
    const result = computeEfficiency(wake, sleep, [hour('2026-08-24', 1, 'x')], now);
    expect(result.awakeMinutes).toBe(360);
    expect(result.ratio).toBeCloseTo(60 / 360);
    expect(result.settled).toBe(true);
  });

  it('is null, never 0, when the day was never started', () => {
    const result = computeEfficiency(null, null, [hour('2026-08-24', 1, 'x')], now);
    expect(result.ratio).toBeNull();
    expect(result.awakeMinutes).toBeNull();
    // Worked minutes are still real and still reported.
    expect(result.workedMinutes).toBe(60);
  });

  it('reports 0 honestly on a started day with no completed Hours', () => {
    const result = computeEfficiency(wake, null, [], now);
    expect(result.workedMinutes).toBe(0);
    expect(result.ratio).toBe(0);
  });

  it('is null rather than a confident lie when the awake span is non-positive', () => {
    const result = computeEfficiency(wake, '2026-08-24T11:00:00Z', [hour('2026-08-24', 1, 'x')], now);
    expect(result.ratio).toBeNull();
  });
});
