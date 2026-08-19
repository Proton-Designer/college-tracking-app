import { describe, expect, it } from 'vitest';
import { normalizeRescueTimeDailySummary } from './rescuetimeNormalize';

describe('normalizeRescueTimeDailySummary', () => {
  it('derives total/productive/distracting minutes from hours and composite percentages', () => {
    const events = normalizeRescueTimeDailySummary({
      date: '2026-08-19',
      total_hours: 6.2,
      all_productive_percentage: 45.5,
      all_distracting_percentage: 39.5,
    });

    expect(events).toEqual([
      { source: 'rescuetime', type: 'screen_summary', metric: 'total_screen_min', value: 372, unit: 'minutes', occurredAt: '2026-08-19T23:59:59.000Z' },
      { source: 'rescuetime', type: 'screen_summary', metric: 'productive_min', value: 169, unit: 'minutes', occurredAt: '2026-08-19T23:59:59.000Z' },
      { source: 'rescuetime', type: 'screen_summary', metric: 'distracting_min', value: 147, unit: 'minutes', occurredAt: '2026-08-19T23:59:59.000Z' },
    ]);
  });

  it('a zero-screen-time day normalizes to all-zero minutes, not a crash or NaN', () => {
    const events = normalizeRescueTimeDailySummary({ date: '2026-08-19', total_hours: 0, all_productive_percentage: 0, all_distracting_percentage: 0 });
    expect(events.every((e) => e.value === 0)).toBe(true);
    expect(events.some((e) => Number.isNaN(e.value))).toBe(false);
  });

  it('timestamps the summary at end-of-day so it always falls on the source day, not the next one', () => {
    const events = normalizeRescueTimeDailySummary({ date: '2026-08-19', total_hours: 5, all_productive_percentage: 50, all_distracting_percentage: 20 });
    expect(events.every((e) => e.occurredAt === '2026-08-19T23:59:59.000Z')).toBe(true);
  });

  it('productive and distracting percentages need not sum to 100 (neutral/uncategorized time exists) -- both are computed independently, never forced to complement each other', () => {
    const events = normalizeRescueTimeDailySummary({ date: '2026-08-19', total_hours: 10, all_productive_percentage: 30, all_distracting_percentage: 20 });
    const productive = events.find((e) => e.metric === 'productive_min')!.value;
    const distracting = events.find((e) => e.metric === 'distracting_min')!.value;
    const total = events.find((e) => e.metric === 'total_screen_min')!.value;
    expect(productive + distracting).toBeLessThan(total); // 50% of the day is neither -- not silently redistributed
  });
});
