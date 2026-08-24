import { describe, expect, it } from 'vitest';
import { computeWeekReview, UNCATEGORIZED, type WeekDayFacts, type WeekHourRow } from './weekReview';

const row = (localDate: string, minutes: number, category: string | null = null): WeekHourRow => ({
  localDate,
  minutes,
  category,
});

const day = (
  localDate: string,
  wakeAt: string | null,
  sleepIntentAt: string | null,
  baselineHours = 4,
): WeekDayFacts => ({ localDate, wakeAt, sleepIntentAt, baselineHours });

describe('computeWeekReview', () => {
  it('groups hours by category with shares, descending', () => {
    const review = computeWeekReview(
      [row('2026-08-24', 60, 'School'), row('2026-08-24', 60, 'School'), row('2026-08-25', 60, 'Content')],
      [],
      [],
    );
    expect(review.hoursByCategory).toEqual([
      { category: 'School', minutes: 120, share: 2 / 3 },
      { category: 'Content', minutes: 60, share: 1 / 3 },
    ]);
    expect(review.totalHours).toBe(3);
    expect(review.totalMinutes).toBe(180);
  });

  it('groups null and blank categories under Uncategorized rather than dropping them', () => {
    const review = computeWeekReview([row('2026-08-24', 60, null), row('2026-08-24', 30, '  ')], [], []);
    expect(review.hoursByCategory).toEqual([{ category: UNCATEGORIZED, minutes: 90, share: 1 }]);
  });

  it('orders the distraction pareto by count, descending', () => {
    const review = computeWeekReview([], ['phone', 'phone', 'bored', 'phone', 'notification'], []);
    expect(review.distractionPareto[0]).toEqual({ cause: 'phone', count: 3, share: 0.6 });
    expect(review.totalDistractions).toBe(5);
  });

  it('computes efficiency only for settled days', () => {
    const review = computeWeekReview(
      [row('2026-08-24', 120, null)],
      [],
      [
        day('2026-08-24', '2026-08-24T12:00:00Z', '2026-08-24T20:00:00Z'), // settled: 120/480
        day('2026-08-25', '2026-08-25T12:00:00Z', null), // never closed
        day('2026-08-26', null, null), // never started
      ],
    );
    expect(review.efficiencyByDay).toEqual([
      { localDate: '2026-08-24', ratio: 0.25 },
      { localDate: '2026-08-25', ratio: null },
      { localDate: '2026-08-26', ratio: null },
    ]);
  });

  it('handles an empty week without dividing by zero', () => {
    const review = computeWeekReview([], [], []);
    expect(review.totalHours).toBe(0);
    expect(review.hoursByCategory).toEqual([]);
    expect(review.distractionPareto).toEqual([]);
    expect(review.efficiencyByDay).toEqual([]);
  });
});
