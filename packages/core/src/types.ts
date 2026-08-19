export type { LocalDate } from './util/date.js';

/**
 * Confidence in a computed value, paired with the sample size that produced it.
 * The engine never fabricates a number to avoid reporting 'insufficient' — see
 * DOMAIN_ENGINE_SPEC.md §0.
 */
export type Confidence = 'high' | 'moderate' | 'low' | 'insufficient';

/** One factor's contribution to a score, mandatory on every scoring function. */
export interface TraceEntry {
  key: string;
  rawInput: unknown;
  normalized: number;
  weight: number;
  contribution: number;
}
