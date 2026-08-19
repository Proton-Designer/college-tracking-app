import type { Confidence, LocalDate } from '../types.js';
import { daysBetween } from '../util/date.js';

const OUTLIER_DISCARD_LN_RATIO = Math.log(6);
const RECENCY_HALF_LIFE_DAYS = 30;
const MULTIPLIER_MIN = 0.5;
const MULTIPLIER_MAX = 3.0;

export interface DurationObservation {
  estimatedMin: number;
  actualMin: number;
  completedAt: LocalDate;
}

export interface CalibrationResult {
  multiplier: number;
  confidence: Confidence;
  effectiveSampleSize: number;
  discardedCount: number;
  /** Weighted geometric standard deviation of the actual/estimated ratio. 1 = no spread. */
  geometricStdDev: number;
}

function confidenceForEffectiveN(nEff: number): Confidence {
  if (nEff >= 12) return 'high';
  if (nEff >= 6) return 'moderate';
  if (nEff >= 3) return 'low';
  return 'insufficient';
}

/**
 * Task duration calibration — DOMAIN_ENGINE_SPEC.md §3. Ratios are multiplicative and
 * right-skewed, so this works in log space (geometric, not arithmetic, mean).
 */
export function computeCalibration(
  observations: DurationObservation[],
  now: LocalDate,
): CalibrationResult {
  const valid = observations.filter((o) => o.estimatedMin > 0 && o.actualMin > 0);

  const ratios = valid.map((o) => ({
    r: Math.log(o.actualMin / o.estimatedMin),
    ageDays: Math.max(daysBetween(o.completedAt, now), 0),
  }));

  const discarded = ratios.filter((o) => Math.abs(o.r) > OUTLIER_DISCARD_LN_RATIO);
  const survivors = ratios.filter((o) => Math.abs(o.r) <= OUTLIER_DISCARD_LN_RATIO);

  const weighted = survivors.map((o) => ({
    ...o,
    w: Math.pow(0.5, o.ageDays / RECENCY_HALF_LIFE_DAYS),
  }));

  const sumW = weighted.reduce((s, o) => s + o.w, 0);
  const sumW2 = weighted.reduce((s, o) => s + o.w * o.w, 0);
  const nEff = sumW > 0 ? (sumW * sumW) / sumW2 : 0;
  const confidence = confidenceForEffectiveN(nEff);

  if (confidence === 'insufficient') {
    return {
      multiplier: 1.0,
      confidence,
      effectiveSampleSize: nEff,
      discardedCount: discarded.length,
      geometricStdDev: 1.0,
    };
  }

  const rMean = weighted.reduce((s, o) => s + o.w * o.r, 0) / sumW;
  const multiplier = clamp(Math.exp(rMean), MULTIPLIER_MIN, MULTIPLIER_MAX);

  const variance =
    weighted.reduce((s, o) => s + o.w * (o.r - rMean) ** 2, 0) / sumW;
  const geometricStdDev = weighted.length >= 2 ? Math.exp(Math.sqrt(variance)) : 1.0;

  return {
    multiplier,
    confidence,
    effectiveSampleSize: nEff,
    discardedCount: discarded.length,
    geometricStdDev,
  };
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}
