import { describe, expect, it } from 'vitest';
import { detectCalibrationInsight } from './calibrationInsight';
import type { DurationObservation } from '../calibration/calibration';

function makeObservations(ratios: number[], estimatedMin = 60): DurationObservation[] {
  return ratios.map((ratio, i) => ({
    estimatedMin,
    actualMin: Math.round(estimatedMin * ratio),
    completedAt: `2026-08-${String(i + 1).padStart(2, '0')}`,
  }));
}

describe('detectCalibrationInsight', () => {
  it('returns null with fewer than 6 observations -- not enough to split in half meaningfully', () => {
    const observations = makeObservations([1.3, 1.3, 1.3, 1.3, 1.3]);
    expect(detectCalibrationInsight(observations, 'reading')).toBeNull();
  });

  it('detects a real, consistent underestimate across 12 observations at medium confidence', () => {
    const observations = makeObservations(Array(12).fill(1.3));
    const result = detectCalibrationInsight(observations, 'lab_report');
    expect(result).not.toBeNull();
    expect(result!.direction).toBe('underestimate');
    expect(result!.ratioPct).toBeCloseTo(30, 0);
    expect(result!.confidence).toBe('medium'); // 12 obs: >=10 & consistent, but <20 so never 'high'
    expect(result!.evidence.effectHoldsInBothHalves).toBe(true);
    expect(result!.evidence.consistentDirection).toBe(true);
    expect(result!.claim).toContain('lab_report');
    expect(result!.claim).toContain('short of actual');
  });

  it('promotes to high confidence once sample size crosses 20 with the same clean effect', () => {
    const observations = makeObservations(Array(25).fill(1.3));
    const result = detectCalibrationInsight(observations, 'coding');
    expect(result!.confidence).toBe('high');
  });

  it('detects a consistent overestimate (actual runs shorter than planned)', () => {
    const observations = makeObservations(Array(12).fill(0.7));
    const result = detectCalibrationInsight(observations, 'gym');
    expect(result!.direction).toBe('overestimate');
    expect(result!.claim).toContain('longer than actual');
  });

  it('returns null when estimates are simply correct -- no deviation at all to report', () => {
    const observations = makeObservations(Array(12).fill(1.0));
    expect(detectCalibrationInsight(observations, 'reading')).toBeNull();
  });

  it('returns null when the deviation is real but negligible (<1%) -- not worth a claim even with a clean sample', () => {
    const observations = makeObservations(Array(20).fill(1.002));
    expect(detectCalibrationInsight(observations, 'reading')).toBeNull();
  });

  it('reports testing confidence when the trend does not hold across both halves of the observation window', () => {
    // All ratios average out to a real deviation, but the pattern reverses between the
    // first and second half of the window -- exactly what effectHoldsInBothHalves exists
    // to catch: a trend that has already stopped is not evidence of an ongoing pattern.
    const ratios = [1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1.6];
    const observations = makeObservations(ratios);
    const result = detectCalibrationInsight(observations, 'exam_prep');
    expect(result).not.toBeNull();
    expect(result!.evidence.effectHoldsInBothHalves).toBe(false);
    expect(result!.confidence).toBe('testing');
  });
});
