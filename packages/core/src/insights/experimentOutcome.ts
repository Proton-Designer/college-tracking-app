import type { LocalDate } from '../types';
import { gateInsightConfidence, type InsightConfidenceLevel, type InsightEvidenceInput } from './confidenceGate';

export interface ExperimentMeasurement {
  value: number;
  localDate: LocalDate;
}

export type ExperimentDirection = 'increase' | 'decrease';

export interface ExperimentOutcome {
  measurementCount: number;
  baselineValue: number;
  trialMeanValue: number;
  /** Signed, relative to baseline. Positive means the trial mean rose above baseline,
   *  regardless of which direction was hypothesized. */
  percentChange: number;
  movedInHypothesizedDirection: boolean;
  /** The N-of-1 trial's confidence, gated by the exact same code that gates
   *  observational insights (DOMAIN_ENGINE_SPEC.md §10) -- a trial that "worked" by eye
   *  but has too little data or too inconsistent a trend gets the same honest 'testing'
   *  tier a weak correlation would. */
  confidence: InsightConfidenceLevel;
  evidence: InsightEvidenceInput;
}

// Need enough days to meaningfully split the trial window in half and still see signal
// in each half -- same reasoning as detectCalibrationInsight's minimum.
export const MIN_EXPERIMENT_MEASUREMENTS = 4;
// A real-world threshold: less than a 10% relative move off baseline isn't a result
// worth calling significant, even from a clean trial.
const NOISE_FLOOR_PCT = 10;
const DIRECTION_CONSISTENCY_THRESHOLD = 0.7;

function mean(measurements: ExperimentMeasurement[]): number {
  return measurements.reduce((sum, m) => sum + m.value, 0) / measurements.length;
}

/**
 * Scores an N-of-1 experiment: did the metric actually move the way the hypothesis
 * predicted, and is that movement real or noise? This is what turns "I think logging
 * homework right after lecture helps" into something earned rather than a vibe --
 * the brief's "N-of-1 experimentation platform rather than a correlation hallucination
 * machine." Returns null when there isn't enough data yet; the trial simply isn't over.
 */
export function computeExperimentOutcome(
  baselineValue: number,
  hypothesizedDirection: ExperimentDirection,
  measurements: ExperimentMeasurement[],
): ExperimentOutcome | null {
  if (measurements.length < MIN_EXPERIMENT_MEASUREMENTS) return null;

  const sorted = [...measurements].sort((a, b) => a.localDate.localeCompare(b.localDate));
  const trialMeanValue = mean(sorted);
  // A defensive floor against a zero baseline producing Infinity/NaN -- a real
  // possibility (e.g. "zero relapses per week" is a legitimate baseline).
  const denominator = Math.max(Math.abs(baselineValue), 1e-6);
  const percentChange = ((trialMeanValue - baselineValue) / denominator) * 100;

  const directionSign = hypothesizedDirection === 'increase' ? 1 : -1;
  const movedInHypothesizedDirection = directionSign * (trialMeanValue - baselineValue) > 0;

  const mid = Math.floor(sorted.length / 2);
  const firstHalfMean = mean(sorted.slice(0, mid));
  const secondHalfMean = mean(sorted.slice(mid));
  const effectHoldsInBothHalves =
    directionSign * (firstHalfMean - baselineValue) > 0 && directionSign * (secondHalfMean - baselineValue) > 0;

  const consistentCount = sorted.filter((m) => directionSign * (m.value - baselineValue) > 0).length;
  const consistentDirection = consistentCount / sorted.length >= DIRECTION_CONSISTENCY_THRESHOLD;

  const evidence: InsightEvidenceInput = {
    sampleSize: sorted.length,
    effectHoldsInBothHalves,
    effectSize: Math.abs(percentChange),
    noiseFloor: NOISE_FLOOR_PCT,
    consistentDirection,
  };

  return {
    measurementCount: sorted.length,
    baselineValue,
    trialMeanValue,
    percentChange,
    movedInHypothesizedDirection,
    confidence: gateInsightConfidence(evidence),
    evidence,
  };
}
