import { describe, expect, it } from 'vitest';
import { computeExperimentOutcome } from './experimentOutcome';
import type { ExperimentMeasurement } from './experimentOutcome';

function series(values: number[]): ExperimentMeasurement[] {
  return values.map((value, i) => ({ value, localDate: `2026-08-${String(i + 1).padStart(2, '0')}` }));
}

describe('computeExperimentOutcome', () => {
  it('returns null with fewer than 4 measurements -- the trial is not over yet', () => {
    expect(computeExperimentOutcome(30, 'decrease', series([25, 26, 27]))).toBeNull();
  });

  it('confirms a hypothesized decrease that holds cleanly across the whole trial, at medium confidence between n=10 and n=20', () => {
    // Baseline: 30% of task attempts derailed by distraction. Hypothesis: a phone-away
    // implementation intention decreases that. Trial logs a consistent drop to ~10%.
    const outcome = computeExperimentOutcome(30, 'decrease', series([12, 10, 8, 11, 9, 10, 11, 9, 10, 8]));
    expect(outcome).not.toBeNull();
    expect(outcome!.movedInHypothesizedDirection).toBe(true);
    expect(outcome!.trialMeanValue).toBeCloseTo(10, 0);
    expect(outcome!.percentChange).toBeLessThan(0);
    expect(outcome!.evidence.sampleSize).toBe(10);
    expect(outcome!.confidence).toBe('medium'); // clean and consistent, but n<20 caps it below 'high'
  });

  it('too few measurements to reach even medium (n<10) is honestly testing-tier, not upgraded because the trend looks clean', () => {
    const outcome = computeExperimentOutcome(30, 'decrease', series([12, 10, 8, 11, 9, 10]));
    expect(outcome!.evidence.sampleSize).toBeLessThan(10);
    expect(outcome!.movedInHypothesizedDirection).toBe(true);
    expect(outcome!.confidence).toBe('testing');
  });

  it('rejects a hypothesis when the metric actually moved the wrong way', () => {
    const outcome = computeExperimentOutcome(30, 'decrease', series([32, 35, 31, 38]));
    expect(outcome).not.toBeNull();
    expect(outcome!.movedInHypothesizedDirection).toBe(false);
    expect(outcome!.percentChange).toBeGreaterThan(0);
  });

  it('reports testing confidence when the trial only partly moved -- e.g. helped in week 1, wore off in week 2', () => {
    // effectHoldsInBothHalves should fail: first half clearly down, second half back up
    // near or past baseline.
    const outcome = computeExperimentOutcome(30, 'decrease', series([10, 9, 11, 32, 34, 33]));
    expect(outcome).not.toBeNull();
    expect(outcome!.evidence.effectHoldsInBothHalves).toBe(false);
    expect(outcome!.confidence).toBe('testing');
  });

  it('scales to high confidence once 20+ clean measurements accumulate', () => {
    const outcome = computeExperimentOutcome(30, 'decrease', series(Array(22).fill(10)));
    expect(outcome!.confidence).toBe('high');
    expect(outcome!.movedInHypothesizedDirection).toBe(true);
  });

  it('handles a zero baseline without producing NaN or Infinity (e.g. "zero relapses per week")', () => {
    const outcome = computeExperimentOutcome(0, 'increase', series([1, 2, 1, 3]));
    expect(outcome).not.toBeNull();
    expect(Number.isFinite(outcome!.percentChange)).toBe(true);
    expect(outcome!.movedInHypothesizedDirection).toBe(true);
  });

  it('an increase hypothesis is scored on the opposite sign from a decrease hypothesis', () => {
    const increased = computeExperimentOutcome(5, 'increase', series([8, 9, 7, 8]));
    expect(increased!.movedInHypothesizedDirection).toBe(true);
    const decreased = computeExperimentOutcome(5, 'decrease', series([8, 9, 7, 8]));
    expect(decreased!.movedInHypothesizedDirection).toBe(false);
  });
});
