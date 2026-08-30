import { describe, expect, it } from 'vitest';
import {
  buildSeries,
  isWeekOutstanding,
  screenTimeDriftSignal,
  summariseSeries,
  unresolvedFields,
  type ConfirmedWeek,
} from './series';

const CURRENT = '2026-08-30';

function week(weekStartDate: string, dailyAverageMinutes: number): ConfirmedWeek {
  return { weekStartDate, dailyAverageMinutes, breakdown: {} };
}

describe('buildSeries — a missed week is a gap, not a zero', () => {
  it('renders an unreported week as null', () => {
    // A zero says "you used your phone for zero minutes"; null says "you did not report". Only one
    // of those is true, and every chart reading this has to render the difference.
    const series = buildSeries([week('2026-08-30', 300)], CURRENT, 3);
    expect(series.map((p) => p.minutes)).toEqual([null, null, 300]);
  });

  it('returns the window oldest-first and always the full length', () => {
    const series = buildSeries([], CURRENT, 4);
    expect(series).toHaveLength(4);
    expect(series[0]!.weekStartDate).toBe('2026-08-09');
    expect(series[3]!.weekStartDate).toBe('2026-08-30');
  });

  it('contains no streak concept at all', () => {
    // D51, and the fourth surface where a streak would have been easy to slip back in.
    const point = buildSeries([week('2026-08-30', 300)], CURRENT, 2)[1]!;
    expect(Object.keys(point).sort()).toEqual(['minutes', 'weekStartDate']);
  });
});

describe('summariseSeries', () => {
  it('averages reported weeks only, so a gap does not drag the mean down', () => {
    const series = buildSeries([week('2026-08-23', 300), week('2026-08-30', 200)], CURRENT, 4);
    const summary = summariseSeries(series);
    expect(summary.reportedWeeks).toBe(2);
    expect(summary.totalWeeks).toBe(4);
    expect(summary.averageMinutes).toBe(250);
  });

  it('reports null rather than zero when nothing has been reported', () => {
    const summary = summariseSeries(buildSeries([], CURRENT, 4));
    expect(summary.averageMinutes).toBeNull();
    expect(summary.deltaMinutes).toBeNull();
  });

  it('needs two reported weeks before it will state a change', () => {
    const one = summariseSeries(buildSeries([week('2026-08-30', 300)], CURRENT, 4));
    expect(one.deltaMinutes).toBeNull();
  });

  it('compares the two most recent REPORTED weeks, never across a gap', () => {
    // Comparing against a gap would either invent a zero or report a change across an arbitrary
    // span, and both read as a fact the user never supplied.
    const series = buildSeries([week('2026-08-09', 400), week('2026-08-30', 300)], CURRENT, 4);
    expect(summariseSeries(series).deltaMinutes).toBe(-100);
  });
});

describe('isWeekOutstanding', () => {
  it('is true for a week never uploaded, and stays true without escalating', () => {
    expect(isWeekOutstanding([], '2026-08-30')).toBe(true);
    expect(isWeekOutstanding([week('2026-08-23', 300)], '2026-08-30')).toBe(true);
  });

  it('is false once the week is confirmed', () => {
    expect(isWeekOutstanding([week('2026-08-30', 300)], '2026-08-30')).toBe(false);
  });
});

describe('unresolvedFields — the no-guessing rule at the confirm boundary', () => {
  it('returns the rows a person still has to fill', () => {
    const unresolved = unresolvedFields([
      { label: 'Total', minutes: 320, needsInput: false },
      { label: 'Social', minutes: null, needsInput: true },
    ]);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]!.label).toBe('Social');
  });

  it('treats a missing number as unresolved even if nothing flagged it', () => {
    // Belt and braces: a null that arrived without its flag is still a number nobody supplied.
    expect(unresolvedFields([{ label: 'Games', minutes: null, needsInput: false }])).toHaveLength(1);
  });

  it('returns nothing when every value was read', () => {
    expect(unresolvedFields([{ label: 'Total', minutes: 300, needsInput: false }])).toEqual([]);
  });
});

describe('screenTimeDriftSignal', () => {
  it('stays silent without enough history', () => {
    // Two weeks is noise, and a confrontation fired off noise spends the mechanic's credibility on
    // nothing.
    const series = buildSeries([week('2026-08-23', 200), week('2026-08-30', 400)], CURRENT, 4);
    expect(screenTimeDriftSignal(series)).toBeNull();
  });

  it('fires on a real rise against the user’s OWN baseline', () => {
    const series = buildSeries(
      [
        week('2026-08-02', 200),
        week('2026-08-09', 200),
        week('2026-08-16', 200),
        week('2026-08-30', 300),
      ],
      CURRENT,
      5,
    );
    const signal = screenTimeDriftSignal(series)!;
    expect(signal.risePercent).toBeCloseTo(0.5);
  });

  it('stays silent on an ordinary busy week', () => {
    const series = buildSeries(
      [
        week('2026-08-02', 200),
        week('2026-08-09', 200),
        week('2026-08-16', 200),
        week('2026-08-30', 220),
      ],
      CURRENT,
      5,
    );
    expect(screenTimeDriftSignal(series)).toBeNull();
  });

  it('never compares against an external norm — only the user’s own history', () => {
    // There is no defensible number of minutes a person should spend on a phone, and the app has
    // no business implying one. A high but STABLE user produces no signal.
    const series = buildSeries(
      [
        week('2026-08-02', 600),
        week('2026-08-09', 600),
        week('2026-08-16', 600),
        week('2026-08-30', 600),
      ],
      CURRENT,
      5,
    );
    expect(screenTimeDriftSignal(series)).toBeNull();
  });
});
