import { describe, expect, it } from 'vitest';
import { evaluateDeviationPrompt, frictionCauseForDeviationResponse } from './deviationPrompt';

const now = new Date('2026-08-19T17:03:00Z');

describe('evaluateDeviationPrompt', () => {
  it('fires when a block is 15+ minutes late and no session has started', () => {
    const result = evaluateDeviationPrompt({
      now,
      plannedStartAt: new Date('2026-08-19T16:45:00Z'), // 18 min late
      taskTitle: 'BME block',
      sessionStarted: false,
    });
    expect(result.shouldFire).toBe(true);
    expect(result.minutesLate).toBe(18);
    expect(result.reason).toBe("BME block hasn't started.");
  });

  it('never fires once a session has actually started, no matter how late it started', () => {
    const result = evaluateDeviationPrompt({
      now,
      plannedStartAt: new Date('2026-08-19T16:00:00Z'), // over an hour late
      taskTitle: 'BME block',
      sessionStarted: true,
    });
    expect(result.shouldFire).toBe(false);
  });

  it('does not fire inside the grace window -- an ordinary transition delay is not a deviation', () => {
    const result = evaluateDeviationPrompt({
      now,
      plannedStartAt: new Date('2026-08-19T16:55:00Z'), // 8 min late
      taskTitle: 'BME block',
      sessionStarted: false,
    });
    expect(result.shouldFire).toBe(false);
  });

  it('respects a custom grace period', () => {
    const result = evaluateDeviationPrompt({
      now,
      plannedStartAt: new Date('2026-08-19T16:58:00Z'), // 5 min late
      taskTitle: 'BME block',
      sessionStarted: false,
      graceMinutes: 5,
    });
    expect(result.shouldFire).toBe(true);
  });
});

describe('frictionCauseForDeviationResponse', () => {
  it('maps each real failure-reason button to a real friction_cause', () => {
    expect(frictionCauseForDeviationResponse('Avoiding')).toEqual({ cause: 'avoided_task' });
    expect(frictionCauseForDeviationResponse('Schedule changed')).toEqual({ cause: 'schedule_changed' });
  });

  it('maps "Forgot" to the honest fallback -- other, with the literal reason as detail, not a fabricated enum value', () => {
    expect(frictionCauseForDeviationResponse('Forgot')).toEqual({ cause: 'other', causeDetail: 'Forgot' });
  });

  it('"Start now" is compliance, not a failure -- no friction log gets written', () => {
    expect(frictionCauseForDeviationResponse('Start now')).toBeNull();
  });
});
