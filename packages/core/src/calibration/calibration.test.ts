import { describe, expect, it } from 'vitest';
import { computeCalibration, type DurationObservation } from './calibration.js';

const NOW = '2026-08-18';

function obs(estimatedMin: number, actualMin: number, daysAgo = 1): DurationObservation {
  return { estimatedMin, actualMin, completedAt: shiftDate(NOW, -daysAgo) };
}

function shiftDate(date: string, deltaDays: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function repeat(n: number, factory: (i: number) => DurationObservation): DurationObservation[] {
  return Array.from({ length: n }, (_, i) => factory(i));
}

describe('computeCalibration', () => {
  it('returns 1.0 for a perfect estimator', () => {
    const observations = repeat(6, () => obs(60, 60));
    const result = computeCalibration(observations, NOW);
    expect(result.multiplier).toBeCloseTo(1.0, 6);
  });

  it('returns ~1.5 for a consistent 1.5x underestimate', () => {
    const observations = repeat(6, () => obs(60, 90));
    const result = computeCalibration(observations, NOW);
    expect(result.multiplier).toBeCloseTo(1.5, 1);
  });

  it('is not moved by one wild outlier, which is discarded', () => {
    const observations = [
      ...repeat(8, () => obs(60, 90)), // 1.5x
      obs(60, 600), // 10x -> |ln(10)| > ln(6), discarded
    ];
    const result = computeCalibration(observations, NOW);
    expect(result.multiplier).toBeCloseTo(1.5, 1);
    expect(result.discardedCount).toBe(1);
  });

  it('weights recent data more heavily than old data', () => {
    const mixedOld = [
      ...repeat(6, () => obs(60, 60, 200)), // 1.0x, very old (small weight)
      ...repeat(6, () => obs(60, 120, 0)), // 2.0x, brand new (full weight)
    ];
    const result = computeCalibration(mixedOld, NOW);
    // recency-weighted mean should sit closer to 2.0 than the unweighted mean of 1.5
    expect(result.multiplier).toBeGreaterThan(1.6);
  });

  it.each([0, 1, 2])('reports insufficient confidence for n=%i', (n) => {
    const observations = repeat(n, () => obs(60, 90));
    const result = computeCalibration(observations, NOW);
    expect(result.confidence).toBe('insufficient');
  });

  it('reports moderate confidence around n=6-11', () => {
    const observations = repeat(7, () => obs(60, 90));
    const result = computeCalibration(observations, NOW);
    expect(result.confidence).toBe('moderate');
  });

  it('reports high confidence at n>=12 with uniform recent weights', () => {
    const observations = repeat(14, () => obs(60, 90, 1));
    const result = computeCalibration(observations, NOW);
    expect(result.confidence).toBe('high');
  });

  it('clamps the multiplier at the 3.0 ceiling', () => {
    const observations = repeat(8, () => obs(60, 300)); // 5x, under the ln(6) discard threshold
    const result = computeCalibration(observations, NOW);
    expect(result.multiplier).toBe(3.0);
  });

  it('clamps the multiplier at the 0.5 floor', () => {
    const observations = repeat(8, () => obs(60, 12)); // 0.2x, under the ln(6) discard threshold
    const result = computeCalibration(observations, NOW);
    expect(result.multiplier).toBe(0.5);
  });

  it('rejects zero and negative inputs without crashing', () => {
    const observations = [
      obs(0, 60),
      obs(60, 0),
      obs(-10, 60),
      obs(60, -10),
      ...repeat(6, () => obs(60, 90)),
    ];
    const result = computeCalibration(observations, NOW);
    expect(Number.isFinite(result.multiplier)).toBe(true);
    expect(result.multiplier).toBeCloseTo(1.5, 1);
  });
});
