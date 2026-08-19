import { describe, expect, it } from 'vitest';
import { evaluateStaleTaskPrompt } from './staleTaskPrompt';

describe('evaluateStaleTaskPrompt', () => {
  it('does not fire for a task planned recently', () => {
    const decision = evaluateStaleTaskPrompt({ today: '2026-08-24', plannedDate: '2026-08-20', taskTitle: 'Read Ch. 5' });
    expect(decision.shouldFire).toBe(false);
    expect(decision.reason).toBeNull();
    expect(decision.daysSincePlanned).toBe(4);
  });

  it('does not fire for a task just under the default 21-day threshold', () => {
    const decision = evaluateStaleTaskPrompt({ today: '2026-08-24', plannedDate: '2026-08-04', taskTitle: 'Read Ch. 5' });
    expect(decision.daysSincePlanned).toBe(20);
    expect(decision.shouldFire).toBe(false);
  });

  it('fires exactly at the default 21-day threshold', () => {
    const decision = evaluateStaleTaskPrompt({ today: '2026-08-24', plannedDate: '2026-08-03', taskTitle: 'Read Ch. 5' });
    expect(decision.daysSincePlanned).toBe(21);
    expect(decision.shouldFire).toBe(true);
    expect(decision.reason).toBe('"Read Ch. 5" has been sitting for 21 days -- still real, or should it go?');
  });

  it('fires for a task far past the threshold, with an accurate day count', () => {
    const decision = evaluateStaleTaskPrompt({ today: '2026-08-24', plannedDate: '2026-06-01', taskTitle: 'Old assignment' });
    expect(decision.shouldFire).toBe(true);
    expect(decision.daysSincePlanned).toBe(84);
    expect(decision.reason).toContain('84 days');
  });

  it('respects a custom threshold', () => {
    expect(evaluateStaleTaskPrompt({ today: '2026-08-24', plannedDate: '2026-08-17', taskTitle: 'X', thresholdDays: 7 }).shouldFire).toBe(true);
    expect(evaluateStaleTaskPrompt({ today: '2026-08-24', plannedDate: '2026-08-19', taskTitle: 'X', thresholdDays: 7 }).shouldFire).toBe(false);
  });

  it('a task planned today or in the future never fires, and never reports a negative day count', () => {
    const today = evaluateStaleTaskPrompt({ today: '2026-08-24', plannedDate: '2026-08-24', taskTitle: 'X' });
    expect(today.shouldFire).toBe(false);
    expect(today.daysSincePlanned).toBe(0);

    const future = evaluateStaleTaskPrompt({ today: '2026-08-24', plannedDate: '2026-08-30', taskTitle: 'X' });
    expect(future.shouldFire).toBe(false);
    expect(future.daysSincePlanned).toBe(0);
  });
});
