import { describe, expect, it } from 'vitest';
import { computeHabitScore, isScheduledOn, type HabitLogEntry } from './habitScore';

const DAILY = { weekdays: [1, 2, 3, 4, 5, 6, 7] };
const WEEKDAYS_ONLY = { weekdays: [1, 2, 3, 4, 5] };

const log = (localDate: string, done = true): HabitLogEntry => ({ localDate, done });

describe('isScheduledOn', () => {
  // 2026-08-24 is a Monday. Anchors the arithmetic weekday calculation against a known date.
  it('computes ISO weekdays without going through UTC', () => {
    expect(isScheduledOn({ weekdays: [1] }, '2026-08-24')).toBe(true); // Monday
    expect(isScheduledOn({ weekdays: [1] }, '2026-08-25')).toBe(false); // Tuesday
    expect(isScheduledOn({ weekdays: [7] }, '2026-08-30')).toBe(true); // Sunday
  });

  it('handles January and February, which the shifted-month arithmetic special-cases', () => {
    expect(isScheduledOn({ weekdays: [4] }, '2026-01-01')).toBe(true); // Thursday
    expect(isScheduledOn({ weekdays: [7] }, '2027-02-28')).toBe(true); // Sunday
  });

  it('handles a leap day', () => {
    expect(isScheduledOn({ weekdays: [2] }, '2028-02-29')).toBe(true); // Tuesday
    expect(isScheduledOn({ weekdays: [6] }, '2028-02-29')).toBe(false);
  });
});

describe('computeHabitScore', () => {
  it('rises toward 100 on consistent check-ins without ever reaching it', () => {
    const logs = Array.from({ length: 30 }, (_, i) => log(`2026-08-${String(i + 1).padStart(2, '0')}`));
    const result = computeHabitScore(logs, DAILY, '2026-08-01', '2026-08-30');
    expect(result.score).toBeGreaterThan(90);
    expect(result.score).toBeLessThan(100);
    expect(result.votes).toBe(30);
    expect(result.observedDays).toBe(30);
  });

  it('dents rather than zeroes on a long miss streak -- the whole point of the model', () => {
    const result = computeHabitScore([], DAILY, '2026-08-01', '2026-08-30');
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThan(20);
  });

  it('never reaches zero even over a very long absence', () => {
    const result = computeHabitScore([], DAILY, '2020-01-01', '2026-08-30');
    expect(result.score).toBeGreaterThan(0);
  });

  it('recovers faster than it decayed -- the asymmetry the no-guilt design wants', () => {
    const missed = computeHabitScore([], DAILY, '2026-08-01', '2026-08-10').score;
    const recoveryLogs = Array.from({ length: 10 }, (_, i) => log(`2026-08-${String(i + 11).padStart(2, '0')}`));
    const recovered = computeHabitScore(
      [...recoveryLogs],
      DAILY,
      '2026-08-11',
      '2026-08-20',
    ).score;
    expect(recovered).toBeGreaterThan(missed);
  });

  it('only counts scheduled days -- a weekend miss on a weekdays-only habit is not a miss', () => {
    // 2026-08-29 and 30 are Sat/Sun.
    const result = computeHabitScore([], WEEKDAYS_ONLY, '2026-08-29', '2026-08-30');
    expect(result.observedDays).toBe(0);
  });

  it('treats an explicit done:false the same as an unanswered day', () => {
    const explicit = computeHabitScore([log('2026-08-24', false)], DAILY, '2026-08-24', '2026-08-24');
    const silent = computeHabitScore([], DAILY, '2026-08-24', '2026-08-24');
    expect(explicit.score).toBe(silent.score);
    // ...but the explicit "no" is still not counted as a vote.
    expect(explicit.votes).toBe(0);
  });

  it('freezes rather than decays while paused -- travel and sick days must not break it', () => {
    const paused = computeHabitScore([], DAILY, '2026-08-01', '2026-08-30', true);
    expect(paused.score).toBe(50);
    expect(paused.observedDays).toBe(0);
  });

  it('still reports all-time votes while paused', () => {
    const paused = computeHabitScore([log('2026-07-01'), log('2026-07-02')], DAILY, '2026-08-01', '2026-08-30', true);
    expect(paused.votes).toBe(2);
  });

  it('reports observedDays so a UI can decline to judge a brand-new habit', () => {
    const result = computeHabitScore([log('2026-08-24')], DAILY, '2026-08-24', '2026-08-24');
    expect(result.observedDays).toBe(1);
  });

  it('returns the neutral start, not 0, for a habit with no elapsed schedule', () => {
    const result = computeHabitScore([], { weekdays: [] }, '2026-08-01', '2026-08-30');
    expect(result.score).toBe(50);
  });

  it('handles an inverted range without looping forever', () => {
    const result = computeHabitScore([], DAILY, '2026-08-30', '2026-08-01');
    expect(result.observedDays).toBe(0);
  });
});
