import { describe, expect, it } from 'vitest';
import { buildHealthDailyFromTelemetry } from './healthDailyRollup';

describe('buildHealthDailyFromTelemetry', () => {
  it('derives the full typed shape from a real day of WHOOP telemetry events', () => {
    const result = buildHealthDailyFromTelemetry([
      { metric: 'sleep_hours', value: 7.2 },
      { metric: 'sleep_performance_pct', value: 88 }, // not part of health_daily's shape -- ignored, not an error
      { metric: 'recovery_pct', value: 62 },
      { metric: 'hrv_ms', value: 45.3 },
      { metric: 'resting_hr', value: 58 },
      { metric: 'workout_completed', value: 1 },
      { metric: 'strain', value: 12.4 },
    ]);
    expect(result).toEqual({
      sleepHours: 7.2,
      whoopRecoveryPct: 62,
      hrvMs: 45.3,
      restingHr: 58,
      strain: 12.4,
      workoutCompleted: true,
    });
  });

  it('reports null, not zero or false, for a metric with no reading that day', () => {
    const result = buildHealthDailyFromTelemetry([{ metric: 'sleep_hours', value: 6.5 }]);
    expect(result.whoopRecoveryPct).toBeNull();
    expect(result.workoutCompleted).toBeNull(); // never logged a workout -- not "false", genuinely unknown
    expect(result.strain).toBeNull();
  });

  it('an empty day (no telemetry at all) returns an honest all-null patch, never a crash', () => {
    expect(buildHealthDailyFromTelemetry([])).toEqual({
      sleepHours: null,
      whoopRecoveryPct: null,
      hrvMs: null,
      restingHr: null,
      strain: null,
      workoutCompleted: null,
    });
  });

  it('the most recent reading wins when a day has two of the same metric (e.g. two workouts)', () => {
    const result = buildHealthDailyFromTelemetry([
      { metric: 'strain', value: 8.0 },
      { metric: 'strain', value: 14.2 },
    ]);
    expect(result.strain).toBe(14.2);
  });

  it('is rebuildable: the same input always produces the same output', () => {
    const events = [{ metric: 'sleep_hours', value: 7.0 }, { metric: 'recovery_pct', value: 55 }];
    const first = buildHealthDailyFromTelemetry(events);
    const second = buildHealthDailyFromTelemetry(events);
    expect(first).toEqual(second);
  });
});
