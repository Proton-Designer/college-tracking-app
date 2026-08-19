import { describe, expect, it } from 'vitest';
import { computeFrictionDistribution, computeFrictionTrend, type FrictionLog } from './frictionAnalytics';

function log(cause: string): FrictionLog {
  return { date: '2026-08-01', cause };
}

describe('computeFrictionDistribution', () => {
  it('returns an empty distribution with no logs', () => {
    const result = computeFrictionDistribution([]);
    expect(result.entries).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it('counts and ranks causes by frequency descending', () => {
    const logs = [
      log('distraction'), log('distraction'), log('distraction'),
      log('underestimated_duration'), log('underestimated_duration'),
      log('unclear_next_action'),
    ];
    const result = computeFrictionDistribution(logs);
    expect(result.entries.map((e) => e.cause)).toEqual([
      'distraction',
      'underestimated_duration',
      'unclear_next_action',
    ]);
    expect(result.totalCount).toBe(6);
  });

  it('reports exact percentages that sum to 100', () => {
    const logs = [log('a'), log('a'), log('b')];
    const result = computeFrictionDistribution(logs);
    const a = result.entries.find((e) => e.cause === 'a')!;
    const b = result.entries.find((e) => e.cause === 'b')!;
    expect(a.percentage).toBeCloseTo((2 / 3) * 100, 6);
    expect(b.percentage).toBeCloseTo((1 / 3) * 100, 6);
    const sum = result.entries.reduce((s, e) => s + e.percentage, 0);
    expect(sum).toBeCloseTo(100, 6);
  });

  it('breaks count ties alphabetically for stable ordering', () => {
    const logs = [log('zebra'), log('apple')];
    const result = computeFrictionDistribution(logs);
    expect(result.entries.map((e) => e.cause)).toEqual(['apple', 'zebra']);
  });

  it('does pure counting with no inference — every log is one vote for its own cause', () => {
    const logs = [log('phone'), log('phone'), log('avoided_task')];
    const result = computeFrictionDistribution(logs);
    expect(result.entries.find((e) => e.cause === 'phone')?.count).toBe(2);
    expect(result.entries.find((e) => e.cause === 'avoided_task')?.count).toBe(1);
  });
});

describe('computeFrictionTrend', () => {
  it('detects a cause trending down between windows', () => {
    const previous = [log('distraction'), log('distraction'), log('distraction'), log('distraction')];
    const current = [log('distraction'), log('other')];
    const trend = computeFrictionTrend(previous, current);
    const distraction = trend.find((t) => t.cause === 'distraction')!;
    expect(distraction.direction).toBe('down');
    expect(distraction.deltaPercentagePoints).toBeLessThan(0);
  });

  it('detects a cause trending up between windows', () => {
    const previous = [log('duration'), log('other'), log('other'), log('other')];
    const current = [log('duration'), log('duration'), log('duration')];
    const trend = computeFrictionTrend(previous, current);
    const duration = trend.find((t) => t.cause === 'duration')!;
    expect(duration.direction).toBe('up');
    expect(duration.deltaPercentagePoints).toBeGreaterThan(0);
  });

  it('reports stable for a cause with an unchanged share', () => {
    const previous = [log('a'), log('b')];
    const current = [log('a'), log('b')];
    const trend = computeFrictionTrend(previous, current);
    const a = trend.find((t) => t.cause === 'a')!;
    expect(a.direction).toBe('stable');
    expect(a.deltaPercentagePoints).toBeCloseTo(0, 6);
  });

  it('handles a cause that only appears in one window', () => {
    const previous = [log('a')];
    const current = [log('a'), log('new_cause')];
    const trend = computeFrictionTrend(previous, current);
    const newCause = trend.find((t) => t.cause === 'new_cause')!;
    expect(newCause.previousPercentage).toBe(0);
    expect(newCause.direction).toBe('up');
  });
});
