import { describe, expect, it } from 'vitest';
import {
  LESSON_CAP,
  LESSON_FLOOR,
  PARTIAL_THRESHOLD_CEILING,
  PARTIAL_THRESHOLD_FLOOR,
  computePartialThreshold,
  targetLessonCount,
} from './ingestionTargets';

describe('targetLessonCount', () => {
  it('scales at ~1 lesson per 9 pages between the floor and the cap', () => {
    expect(targetLessonCount(270)).toBe(30);
    expect(targetLessonCount(450)).toBe(50);
  });

  it('never goes below the floor or above the cap', () => {
    expect(targetLessonCount(40)).toBe(LESSON_FLOOR);
    expect(targetLessonCount(2000)).toBe(LESSON_CAP);
  });

  it('gives an unknown page count the floor rather than a guess scaled from nothing', () => {
    expect(targetLessonCount(null)).toBe(LESSON_FLOOR);
    expect(targetLessonCount(0)).toBe(LESSON_FLOOR);
    expect(targetLessonCount(-5)).toBe(LESSON_FLOOR);
  });
});

describe('computePartialThreshold', () => {
  it('is half the target, rounded up', () => {
    expect(computePartialThreshold(8)).toBe(4);
    expect(computePartialThreshold(9)).toBe(5);
    expect(computePartialThreshold(12)).toBe(6);
  });

  it('caps at the ceiling, so a large source does not have to be half-done to be usable', () => {
    expect(computePartialThreshold(60)).toBe(PARTIAL_THRESHOLD_CEILING);
    expect(computePartialThreshold(300)).toBe(PARTIAL_THRESHOLD_CEILING);
  });

  it('floors at 3, so the offer is a warm-up deck rather than a teaser', () => {
    expect(computePartialThreshold(1)).toBe(PARTIAL_THRESHOLD_FLOOR);
    expect(computePartialThreshold(4)).toBe(PARTIAL_THRESHOLD_FLOOR);
    expect(computePartialThreshold(0)).toBe(PARTIAL_THRESHOLD_FLOOR);
  });

  it('THE BUG THIS EXISTS FOR: a short source can still reach the threshold', () => {
    // ULM shipped a FIXED threshold of 10. A source whose target lesson count is 6 could then
    // never reach `partial` — the threshold was above everything the source would ever produce —
    // so progressive availability was silently off for exactly the short sources (their onboarding
    // sample book) it helps most. The property, stated as a property rather than as three
    // examples: the threshold is never above what the source is trying to produce, for any target
    // a source can actually have.
    for (let target = 1; target <= 200; target += 1) {
      expect(computePartialThreshold(target)).toBeLessThanOrEqual(Math.max(target, PARTIAL_THRESHOLD_FLOOR));
    }
    expect(computePartialThreshold(6)).toBe(3);
  });

  it('honours caller-supplied bounds', () => {
    expect(computePartialThreshold(40, 20, 5)).toBe(20);
    expect(computePartialThreshold(2, 20, 5)).toBe(5);
  });
});
