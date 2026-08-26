import type { LocalDate } from '../types';

/**
 * BLUEPRINT 5.6, rule 1: "Practice tests high, real exam lower → retrieval is too easy
 * or too close to study. Scheduler adds spacing, hardens question formats, moves
 * practice tests earlier." This module computes the gap; the recommendation text lives
 * with the verdict so every surface says the same thing.
 *
 * Thresholds follow the S3 calibration module's discipline: a sample floor before any
 * verdict (one practice test proves nothing), and a gap floor so noise never fires the
 * rule -- flagging on noise is the confident nonsense the rule exists to catch.
 */

export interface PracticeTestEntry {
  localDate: LocalDate;
  /** 0-100. */
  scorePct: number;
  timed: boolean;
}

/** Practice must beat the real score by at least this much to call it inflated. */
export const PRACTICE_GAP_THRESHOLD_PCT = 8;
export const MIN_PRACTICE_SAMPLE = 2;

export type PracticeBenchmarkVerdict =
  | { kind: 'insufficientData'; practiceCount: number }
  | { kind: 'aligned'; practiceAvgPct: number; realScorePct: number; gapPct: number }
  | {
      kind: 'practiceInflated';
      practiceAvgPct: number;
      realScorePct: number;
      gapPct: number;
      /** The 5.6 rule's own prescription, worded once. */
      recommendation: string;
    };

export function assessPracticeBenchmark(
  practiceTests: PracticeTestEntry[],
  realScorePct: number,
): PracticeBenchmarkVerdict {
  if (practiceTests.length < MIN_PRACTICE_SAMPLE) {
    return { kind: 'insufficientData', practiceCount: practiceTests.length };
  }
  const practiceAvgPct = practiceTests.reduce((sum, t) => sum + t.scorePct, 0) / practiceTests.length;
  const gapPct = practiceAvgPct - realScorePct;
  if (gapPct <= PRACTICE_GAP_THRESHOLD_PCT) {
    return { kind: 'aligned', practiceAvgPct, realScorePct, gapPct };
  }
  return {
    kind: 'practiceInflated',
    practiceAvgPct,
    realScorePct,
    gapPct,
    recommendation:
      'Practice ran ahead of the real result — retrieval was too easy or too close to study. ' +
      'Add spacing, harden the question formats, and move the practice tests earlier in the curve.',
  };
}
