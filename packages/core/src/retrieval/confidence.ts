import type { LocalDate } from '../types';
import { addDays, compareLocalDate } from '../util/date';
import type { AttemptEntry } from './scheduler';

/**
 * Confidence-vs-correctness calibration -- BLUEPRINT 5.4's illusion-of-competence check.
 *
 * NOT packages/core/src/calibration/, which is DURATION calibration (estimate vs actual
 * minutes) -- same word, unrelated concept, and the module split is deliberate so the
 * two never blur (the naming hazard is called out in BLUEPRINT_PLAN's S3 section).
 */

export interface CourseAttempt extends AttemptEntry {
  courseId: number;
  topic: string | null;
}

export interface CourseCalibration {
  courseId: number;
  sureCount: number;
  sureWrongCount: number;
  /** sureWrong / sure. 0 when no 'sure' taps exist. */
  sureWrongRate: number;
  /**
   * The blueprint's ~15% rule, with a sample floor: below MIN_SURE_SAMPLE 'sure' taps
   * the rate is noise (1 wrong of 3 is 33% and means nothing), and flagging a course on
   * noise is exactly the kind of confident nonsense the check exists to catch.
   */
  flagged: boolean;
}

export const SURE_WRONG_THRESHOLD = 0.15;
export const MIN_SURE_SAMPLE = 5;

/** Topics with a sure-but-wrong inside this window get weighted up in the queue. */
const WEIGHT_WINDOW_DAYS = 14;

export function computeCourseCalibration(attempts: CourseAttempt[]): CourseCalibration[] {
  const byCourse = new Map<number, { sure: number; sureWrong: number }>();
  for (const attempt of attempts) {
    if (attempt.confidence !== 'sure') continue;
    const entry = byCourse.get(attempt.courseId) ?? { sure: 0, sureWrong: 0 };
    entry.sure += 1;
    if (!attempt.correct) entry.sureWrong += 1;
    byCourse.set(attempt.courseId, entry);
  }
  return [...byCourse.entries()].map(([courseId, { sure, sureWrong }]) => {
    const rate = sure > 0 ? sureWrong / sure : 0;
    return {
      courseId,
      sureCount: sure,
      sureWrongCount: sureWrong,
      sureWrongRate: rate,
      flagged: sure >= MIN_SURE_SAMPLE && rate > SURE_WRONG_THRESHOLD,
    };
  });
}

/** Topics to weight up: any sure-but-wrong within the trailing window. */
export function weightedTopics(attempts: CourseAttempt[], today: LocalDate): Set<string> {
  const windowStart = addDays(today, -WEIGHT_WINDOW_DAYS);
  const topics = new Set<string>();
  for (const attempt of attempts) {
    if (
      attempt.confidence === 'sure' &&
      !attempt.correct &&
      attempt.topic != null &&
      compareLocalDate(attempt.localDate, windowStart) >= 0
    ) {
      topics.add(attempt.topic);
    }
  }
  return topics;
}
