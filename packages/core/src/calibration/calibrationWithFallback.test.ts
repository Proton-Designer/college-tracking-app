import { describe, expect, it } from 'vitest';
import { computeCalibrationWithFallback } from './calibrationWithFallback';
import type { DurationObservation } from './calibration';

const NOW = '2026-08-18';

function obs(estimatedMin: number, actualMin: number): DurationObservation {
  return { estimatedMin, actualMin, completedAt: NOW };
}

function repeat(n: number, factory: () => DurationObservation): DurationObservation[] {
  return Array.from({ length: n }, factory);
}

describe('computeCalibrationWithFallback', () => {
  it('uses the category-specific multiplier when it has enough data', () => {
    const category = repeat(8, () => obs(60, 90)); // 1.5x
    const global = repeat(8, () => obs(60, 60)); // 1.0x
    const result = computeCalibrationWithFallback(category, global, NOW);
    expect(result.multiplier).toBeCloseTo(1.5, 1);
    expect(result.source).toBe('category');
  });

  it('falls back to the global multiplier when category data is insufficient', () => {
    const category = repeat(2, () => obs(60, 90));
    const global = repeat(8, () => obs(60, 120)); // 2.0x
    const result = computeCalibrationWithFallback(category, global, NOW);
    expect(result.multiplier).toBeCloseTo(2.0, 1);
    expect(result.source).toBe('global');
  });

  it('returns 1.0 and says so when both category and global data are insufficient', () => {
    const category = repeat(1, () => obs(60, 90));
    const global = repeat(2, () => obs(60, 90));
    const result = computeCalibrationWithFallback(category, global, NOW);
    expect(result.multiplier).toBe(1.0);
    expect(result.source).toBe('none');
    expect(result.confidence).toBe('insufficient');
  });
});
