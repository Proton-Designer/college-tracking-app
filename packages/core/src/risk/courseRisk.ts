import type { Confidence, TraceEntry } from '../types.js';
import { bandForScore, type RiskBand } from './assignmentRisk.js';

const SOFTMAX_TEMPERATURE = 18;

export interface CourseRiskItem {
  id: string;
  /** Assignment-level risk score, 0-100. */
  score: number;
}

export interface CourseRiskInput {
  items: CourseRiskItem[];
}

export interface CourseRiskResult {
  score: number;
  band: RiskBand;
  trace: TraceEntry[];
  confidence: Confidence;
  sampleSize: number;
}

/**
 * Course risk is a softmax-weighted aggregate of its items' risk scores, not their
 * mean — a course with one critical exam and nine trivial items must not be diluted
 * to "moderate". DOMAIN_ENGINE_SPEC.md §1.
 */
export function computeCourseRisk(input: CourseRiskInput): CourseRiskResult {
  if (input.items.length === 0) {
    return { score: 0, band: bandForScore(0), trace: [], confidence: 'insufficient', sampleSize: 0 };
  }

  const softmaxWeights = input.items.map((item) => Math.exp(item.score / SOFTMAX_TEMPERATURE));
  const totalWeight = softmaxWeights.reduce((sum, w) => sum + w, 0);
  const weightedSum = input.items.reduce(
    (sum, item, i) => sum + item.score * (softmaxWeights[i] ?? 0),
    0,
  );

  const raw = weightedSum / totalWeight;
  const score = Math.min(100, Math.round(raw));

  const trace: TraceEntry[] = input.items.map((item, i) => ({
    key: item.id,
    rawInput: item.score,
    normalized: item.score / 100,
    weight: (softmaxWeights[i] ?? 0) / totalWeight,
    contribution: item.score * ((softmaxWeights[i] ?? 0) / totalWeight),
  }));

  const confidence: Confidence = input.items.length >= 3 ? 'high' : 'moderate';

  return { score, band: bandForScore(score), trace, confidence, sampleSize: input.items.length };
}
