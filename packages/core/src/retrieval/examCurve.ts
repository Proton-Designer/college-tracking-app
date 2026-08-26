import type { LocalDate } from '../types';
import { addDays, compareLocalDate } from '../util/date';

/**
 * Backward-planned exam retrieval curve -- BLUEPRINT 5.3's exam/quiz row, the S4 half
 * (D25). Retrieval sessions on an expanding curve (D-21, D-14, D-7, D-3), timed
 * practice tests at D-7 and D-2, light review D-1. Never a cram block the night before:
 * the curve simply has nothing heavier than light review inside D-1, by construction.
 *
 * Derived on read, never stored -- the same no-scheduler-state argument as SM-2
 * (migration 42's header). The curve is a pure function of (today, examDate); storing
 * it would add a row that can silently disagree with the dates that define it.
 *
 * A practice test IS retrieval, so where the blueprint's two lists collide (D-7), the
 * practice test stands and no separate retrieval session is emitted for that day.
 */

export type ExamSessionKind = 'retrieval' | 'practice_test' | 'light_review';

export interface ExamCurveSession {
  date: LocalDate;
  kind: ExamSessionKind;
  /** Days before the exam (positive; 1 = the day before). */
  daysBefore: number;
}

export interface ExamCurve {
  sessions: ExamCurveSession[];
  /**
   * True when the full curve did not fit between today and the exam -- late course
   * entry, late syllabus confirm, or a late-added exam. The remaining sessions are
   * still the evidence-shaped tail of the curve, not a rescheduled cram.
   */
  compressed: boolean;
  /** True when the exam is today or past -- no sessions are emitted at all. */
  examReached: boolean;
}

/** daysBefore -> kind, in curve order. The full evidence-based shape. */
const FULL_CURVE: ReadonlyArray<readonly [number, ExamSessionKind]> = [
  [21, 'retrieval'],
  [14, 'retrieval'],
  [7, 'practice_test'],
  [3, 'retrieval'],
  [2, 'practice_test'],
  [1, 'light_review'],
];

export function buildExamCurve(today: LocalDate, examDate: LocalDate): ExamCurve {
  if (compareLocalDate(examDate, today) <= 0) {
    return { sessions: [], compressed: true, examReached: true };
  }

  const sessions: ExamCurveSession[] = [];
  let dropped = 0;
  for (const [daysBefore, kind] of FULL_CURVE) {
    const date = addDays(examDate, -daysBefore);
    if (compareLocalDate(date, today) < 0) {
      dropped++;
      continue;
    }
    sessions.push({ date, kind, daysBefore });
  }

  return { sessions, compressed: dropped > 0, examReached: false };
}
