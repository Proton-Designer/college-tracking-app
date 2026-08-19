import { describe, expect, it } from 'vitest';
import { normalizeWhoopRecovery, normalizeWhoopSleep, normalizeWhoopWorkout } from './whoopNormalize';

describe('normalizeWhoopSleep', () => {
  it('derives sleep_hours from in-bed time minus awake time, and emits sleep_performance_pct', () => {
    const events = normalizeWhoopSleep({
      id: 'sleep-1',
      start: '2026-08-19T00:00:00Z',
      end: '2026-08-19T07:30:00Z',
      score: {
        sleep_performance_percentage: 88,
        stage_summary: { total_in_bed_time_milli: 8 * 3_600_000, total_awake_time_milli: 30 * 60_000 },
      },
    });
    const sleepHours = events.find((e) => e.metric === 'sleep_hours');
    expect(sleepHours?.value).toBe(7.5);
    expect(sleepHours?.unit).toBe('hours');
    expect(sleepHours?.source).toBe('whoop');
    const perf = events.find((e) => e.metric === 'sleep_performance_pct');
    expect(perf?.value).toBe(88);
  });

  it('emits nothing when the score is entirely absent -- never fabricates a sleep duration', () => {
    const events = normalizeWhoopSleep({ id: 'sleep-2', start: '2026-08-19T00:00:00Z', end: '2026-08-19T07:00:00Z', score: null });
    expect(events).toEqual([]);
  });
});

describe('normalizeWhoopRecovery', () => {
  it('emits recovery_pct, hrv_ms, and resting_hr as separate telemetry entries', () => {
    const events = normalizeWhoopRecovery({
      cycle_id: 1,
      created_at: '2026-08-19T08:00:00Z',
      score: { recovery_score: 62, hrv_rmssd_milli: 45.3, resting_heart_rate: 58 },
    });
    expect(events).toHaveLength(3);
    expect(events.find((e) => e.metric === 'recovery_pct')?.value).toBe(62);
    expect(events.find((e) => e.metric === 'hrv_ms')?.value).toBe(45.3);
    expect(events.find((e) => e.metric === 'resting_hr')?.value).toBe(58);
  });

  it('omits a metric individually when only part of the score is present', () => {
    const events = normalizeWhoopRecovery({ cycle_id: 2, created_at: '2026-08-19T08:00:00Z', score: { recovery_score: 40, hrv_rmssd_milli: null, resting_heart_rate: null } });
    expect(events).toHaveLength(1);
    expect(events[0]!.metric).toBe('recovery_pct');
  });
});

describe('normalizeWhoopWorkout', () => {
  it('always emits workout_completed, plus strain when present', () => {
    const events = normalizeWhoopWorkout({ id: 'w1', start: '2026-08-19T17:00:00Z', end: '2026-08-19T18:00:00Z', score: { strain: 12.4 } });
    expect(events.find((e) => e.metric === 'workout_completed')?.value).toBe(1);
    expect(events.find((e) => e.metric === 'strain')?.value).toBe(12.4);
  });

  it('still reports workout_completed even when strain is unavailable', () => {
    const events = normalizeWhoopWorkout({ id: 'w2', start: '2026-08-19T17:00:00Z', end: '2026-08-19T18:00:00Z', score: null });
    expect(events).toHaveLength(1);
    expect(events[0]!.metric).toBe('workout_completed');
  });
});
