import { describe, expect, it } from 'vitest';
import { buildScreenDailyFromTelemetry } from './screenDailyRollup';

describe('buildScreenDailyFromTelemetry', () => {
  it('derives the full typed shape from a real day of RescueTime telemetry', () => {
    const result = buildScreenDailyFromTelemetry([
      { metric: 'total_screen_min', value: 372 },
      { metric: 'productive_min', value: 169 },
      { metric: 'distracting_min', value: 147 },
    ]);
    expect(result).toEqual({ totalScreenMin: 372, distractingMin: 147, productiveMin: 169 });
  });

  it('an empty day returns an honest all-null patch, never a crash', () => {
    expect(buildScreenDailyFromTelemetry([])).toEqual({ totalScreenMin: null, distractingMin: null, productiveMin: null });
  });

  it('the most recent reading wins when a day has two summaries (e.g. a re-sync later the same day)', () => {
    const result = buildScreenDailyFromTelemetry([
      { metric: 'total_screen_min', value: 100 },
      { metric: 'total_screen_min', value: 340 },
    ]);
    expect(result.totalScreenMin).toBe(340);
  });

  it('is rebuildable: the same input always produces the same output', () => {
    const events = [{ metric: 'total_screen_min', value: 200 }, { metric: 'productive_min', value: 80 }];
    expect(buildScreenDailyFromTelemetry(events)).toEqual(buildScreenDailyFromTelemetry(events));
  });
});
