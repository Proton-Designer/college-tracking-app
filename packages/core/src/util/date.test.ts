import { describe, expect, it } from 'vitest';
import { addDays, compareLocalDate, daysBetween, isValidLocalDate } from './date';

describe('daysBetween', () => {
  it('returns 0 for the same date', () => {
    expect(daysBetween('2026-08-18', '2026-08-18')).toBe(0);
  });

  it('returns a positive count for a future date', () => {
    expect(daysBetween('2026-08-18', '2026-08-28')).toBe(10);
  });

  it('returns a negative count for a past date (overdue)', () => {
    expect(daysBetween('2026-08-18', '2026-08-10')).toBe(-8);
  });

  it('crosses a month boundary correctly', () => {
    expect(daysBetween('2026-08-25', '2026-09-05')).toBe(11);
  });

  it('crosses a year boundary correctly', () => {
    expect(daysBetween('2026-12-28', '2027-01-03')).toBe(6);
  });

  it('handles a leap-year February correctly', () => {
    expect(daysBetween('2028-02-27', '2028-03-01')).toBe(3);
  });
});

describe('addDays', () => {
  it('adds positive days within a month', () => {
    expect(addDays('2026-08-18', 3)).toBe('2026-08-21');
  });

  it('adds days across a month boundary', () => {
    expect(addDays('2026-08-30', 3)).toBe('2026-09-02');
  });

  it('subtracts days with a negative count', () => {
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31');
  });

  it('is the inverse of daysBetween', () => {
    const start = '2026-03-10';
    const n = 47;
    expect(daysBetween(start, addDays(start, n))).toBe(n);
  });
});

describe('compareLocalDate', () => {
  it('returns 0 for equal dates', () => {
    expect(compareLocalDate('2026-08-18', '2026-08-18')).toBe(0);
  });

  it('returns negative when the first date is earlier', () => {
    expect(compareLocalDate('2026-08-18', '2026-08-19')).toBeLessThan(0);
  });

  it('returns positive when the first date is later', () => {
    expect(compareLocalDate('2026-08-19', '2026-08-18')).toBeGreaterThan(0);
  });
});

describe('isValidLocalDate', () => {
  it('accepts a well-formed date', () => {
    expect(isValidLocalDate('2026-08-18')).toBe(true);
  });

  it('rejects malformed strings', () => {
    expect(isValidLocalDate('2026/08/18')).toBe(false);
    expect(isValidLocalDate('not-a-date')).toBe(false);
  });

  it('rejects calendar-invalid dates', () => {
    expect(isValidLocalDate('2026-02-30')).toBe(false);
    expect(isValidLocalDate('2026-13-01')).toBe(false);
  });
});
