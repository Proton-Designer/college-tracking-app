import { describe, expect, it } from 'vitest';
import {
  computeRecoveryModeTrigger,
  PHYSIOLOGICAL_MAX_POSSIBLE,
  RECOVERY_MODE_THRESHOLD,
  type RecoveryModeInput,
} from './trigger';

const baseline: RecoveryModeInput = {
  sleepHours: 8,
  sleepBaselineHours: 8,
  whoopRecoveryPct: 80,
  overdueTaskCount: 0,
  hardDeadlinesWithin48h: 0,
  missedYesterdayCheckin: false,
  yesterdayMitCompletionCount: 3,
  committedCalendarHours: 4,
  anyActiveBackplanCompressed: false,
};

describe('the anti-excuse invariant (structural)', () => {
  it('proves the maximum possible physiological-only total sits below the threshold', () => {
    expect(PHYSIOLOGICAL_MAX_POSSIBLE).toBeLessThan(RECOVERY_MODE_THRESHOLD);
  });

  it('never triggers Recovery Mode from physiology alone, exhaustively over both physiological signals', () => {
    for (const lowSleep of [true, false]) {
      for (const lowRecovery of [true, false]) {
        const result = computeRecoveryModeTrigger({
          ...baseline,
          sleepHours: lowSleep ? 4 : 8,
          sleepBaselineHours: 8,
          whoopRecoveryPct: lowRecovery ? 10 : 80,
        });
        expect(result.triggered).toBe(false);
      }
    }
  });

  it('does not trigger even with every physiological signal active plus a single weak non-physiological one', () => {
    // physiological max = 3; adding the single weakest non-physiological signal (1 point) = 4, still < 5.
    const result = computeRecoveryModeTrigger({
      ...baseline,
      sleepHours: 4,
      sleepBaselineHours: 8,
      whoopRecoveryPct: 10,
      committedCalendarHours: 9, // +1, non-physiological
    });
    expect(result.total).toBe(4);
    expect(result.triggered).toBe(false);
  });
});

describe('threshold boundary', () => {
  it('does not trigger at a total of 4', () => {
    const result = computeRecoveryModeTrigger({
      ...baseline,
      overdueTaskCount: 3, // +2
      missedYesterdayCheckin: true, // +1
      committedCalendarHours: 9, // +1
    });
    expect(result.total).toBe(4);
    expect(result.triggered).toBe(false);
  });

  it('triggers at a total of 5 with a non-physiological signal present', () => {
    const result = computeRecoveryModeTrigger({
      ...baseline,
      overdueTaskCount: 3, // +2
      hardDeadlinesWithin48h: 2, // +2
      missedYesterdayCheckin: true, // +1
    });
    expect(result.total).toBe(5);
    expect(result.triggered).toBe(true);
  });
});

describe('signal classification', () => {
  it('reports each signal with its class and active state', () => {
    const result = computeRecoveryModeTrigger({ ...baseline, overdueTaskCount: 3 });
    const overdueSignal = result.signals.find((s) => s.key === 'overdueTasks');
    expect(overdueSignal?.class).toBe('execution');
    expect(overdueSignal?.active).toBe(true);
    expect(overdueSignal?.points).toBe(2);
  });

  it('treats missing sleep/recovery data as inactive rather than fabricating a trigger', () => {
    const result = computeRecoveryModeTrigger({ ...baseline, sleepHours: null, sleepBaselineHours: null, whoopRecoveryPct: null });
    expect(result.physiologicalTotal).toBe(0);
  });
});
