import { describe, expect, it } from 'vitest';
import { buildLoadForecast, FORECAST_HORIZON_DAYS } from './loadForecast';

// 2026-08-31 is a Monday -- baselines keyed by ISO weekday read naturally from it.
const MONDAY = '2026-08-31';

describe('buildLoadForecast', () => {
  it('covers exactly the 21-day horizon with per-weekday baselines in minutes', () => {
    const forecast = buildLoadForecast(MONDAY, [], { '1': 5, '7': 0 }, 4);
    expect(forecast.days).toHaveLength(FORECAST_HORIZON_DAYS);
    expect(forecast.days[0]).toEqual({ date: MONDAY, plannedMinutes: 0, baselineMinutes: 300, overflowMinutes: 0 });
    // Sunday's explicit 0-hour baseline is honored, not defaulted.
    expect(forecast.days[6]!.baselineMinutes).toBe(0);
    // An unkeyed weekday falls back.
    expect(forecast.days[1]!.baselineMinutes).toBe(240);
  });

  it('sums multiple planned items on one day and names the overflow', () => {
    const forecast = buildLoadForecast(
      MONDAY,
      [
        { date: MONDAY, minutes: 200 },
        { date: MONDAY, minutes: 150 },
      ],
      null,
      4, // 240 min baseline
    );
    expect(forecast.days[0]!.plannedMinutes).toBe(350);
    expect(forecast.days[0]!.overflowMinutes).toBe(110);
    expect(forecast.overloadedDays).toHaveLength(1);
  });

  it('suggests pulling overflow to the EARLIEST day with spare capacity', () => {
    const wednesday = '2026-09-02';
    const forecast = buildLoadForecast(
      MONDAY,
      [
        { date: MONDAY, minutes: 240 }, // full, no spare
        { date: wednesday, minutes: 400 }, // 160 over
      ],
      null,
      4,
    );
    expect(forecast.suggestions).toEqual([{ fromDate: wednesday, toDate: '2026-09-01', minutes: 160 }]);
  });

  it('a suggestion never exceeds the target day\'s spare capacity', () => {
    const forecast = buildLoadForecast(
      MONDAY,
      [
        { date: MONDAY, minutes: 200 }, // 40 spare
        { date: '2026-09-01', minutes: 400 }, // 160 over
      ],
      null,
      4,
    );
    expect(forecast.suggestions).toEqual([{ fromDate: '2026-09-01', toDate: MONDAY, minutes: 40 }]);
  });

  it('two overflows never double-book the same spare capacity', () => {
    const forecast = buildLoadForecast(
      MONDAY,
      [
        { date: '2026-09-01', minutes: 300 }, // 60 over
        { date: '2026-09-02', minutes: 300 }, // 60 over
      ],
      null,
      4,
    );
    // Monday has 240 spare; first overflow takes 60 of it, second takes another 60.
    expect(forecast.suggestions).toEqual([
      { fromDate: '2026-09-01', toDate: MONDAY, minutes: 60 },
      { fromDate: '2026-09-02', toDate: MONDAY, minutes: 60 },
    ]);
  });

  it('planned work with no earlier spare day yields a warning but no suggestion', () => {
    const forecast = buildLoadForecast(MONDAY, [{ date: MONDAY, minutes: 500 }], null, 4);
    expect(forecast.overloadedDays).toHaveLength(1);
    expect(forecast.suggestions).toEqual([]);
  });

  it('a zero-planned horizon is calm: no overloads, totals honest', () => {
    const forecast = buildLoadForecast(MONDAY, [], null, 4);
    expect(forecast.overloadedDays).toEqual([]);
    expect(forecast.totalPlannedMinutes).toBe(0);
    expect(forecast.totalBaselineMinutes).toBe(21 * 240);
  });
});
