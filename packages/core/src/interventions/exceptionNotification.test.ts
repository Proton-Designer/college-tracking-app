import { describe, expect, it } from 'vitest';
import { evaluateUpcomingBlockNotification } from './exceptionNotification';

const now = new Date('2026-08-19T16:14:00Z');

describe('evaluateUpcomingBlockNotification', () => {
  it('fires with a specific, cited fact 8 minutes before a timeboxed block starts', () => {
    const result = evaluateUpcomingBlockNotification({
      now,
      plannedStartAt: new Date('2026-08-19T16:22:00Z'),
      taskTitle: 'BME block',
      screenTimeMinutesToday: 41,
    });
    expect(result.shouldFire).toBe(true);
    expect(result.minutesUntilStart).toBe(8);
    expect(result.reason).toBe('BME block begins in 8 min. You\'ve used 41 min of social media today.');
  });

  it('does not fire outside the lead-time window -- too far out', () => {
    const result = evaluateUpcomingBlockNotification({
      now,
      plannedStartAt: new Date('2026-08-19T17:00:00Z'), // 46 min out
      taskTitle: 'BME block',
      screenTimeMinutesToday: 10,
    });
    expect(result.shouldFire).toBe(false);
    expect(result.reason).toBeNull();
  });

  it('does not fire once the planned start has already passed -- that is deviation-prompt territory', () => {
    const result = evaluateUpcomingBlockNotification({
      now,
      plannedStartAt: new Date('2026-08-19T16:00:00Z'), // 14 min ago
      taskTitle: 'BME block',
      screenTimeMinutesToday: 10,
    });
    expect(result.shouldFire).toBe(false);
    expect(result.minutesUntilStart).toBeLessThan(0);
  });

  it('respects a custom lead time', () => {
    const result = evaluateUpcomingBlockNotification({
      now,
      plannedStartAt: new Date('2026-08-19T16:19:00Z'), // 5 min out
      taskTitle: 'BME block',
      screenTimeMinutesToday: 0,
      leadTimeMinutes: 3,
    });
    expect(result.shouldFire).toBe(false); // 5 min out, but lead time is only 3
  });

  it('never fabricates a screen-time figure when no rollup exists for today yet', () => {
    const result = evaluateUpcomingBlockNotification({
      now,
      plannedStartAt: new Date('2026-08-19T16:22:00Z'),
      taskTitle: 'BME block',
      screenTimeMinutesToday: null,
    });
    expect(result.shouldFire).toBe(true);
    expect(result.reason).toBe('BME block begins in 8 min.');
    expect(result.reason).not.toContain('social media');
  });

  it('never fires generic encouragement -- the reason always cites the specific task and a real number', () => {
    const result = evaluateUpcomingBlockNotification({
      now,
      plannedStartAt: new Date('2026-08-19T16:19:00Z'),
      taskTitle: 'Organic Chem problem set',
      screenTimeMinutesToday: 0,
    });
    expect(result.reason).toContain('Organic Chem problem set');
    expect(result.reason).toMatch(/\d+ min/);
  });
});
