import { describe, expect, it } from 'vitest';
import { computeSchedulerState, type AttemptEntry } from './scheduler';
import { buildDueQueue, type QueueQuestion } from './queue';
import { computeCourseCalibration, weightedTopics, type CourseAttempt } from './confidence';

const a = (localDate: string, correct: boolean, confidence: AttemptEntry['confidence'] = 'thinkso'): AttemptEntry => ({
  localDate,
  correct,
  confidence,
});

describe('computeSchedulerState (SM-2-lite)', () => {
  it('a new question is due on its creation day -- no scheduler has to notice it', () => {
    const state = computeSchedulerState([], '2026-08-25');
    expect(state.dueDate).toBe('2026-08-25');
    expect(state.intervalDays).toBe(0);
    expect(state.lapses).toBe(0);
  });

  it('climbs the ladder 1 -> 3 -> 7 -> 21 on correct answers', () => {
    let attempts: AttemptEntry[] = [a('2026-09-01', true)];
    expect(computeSchedulerState(attempts, '2026-08-25').dueDate).toBe('2026-09-02'); // +1
    attempts = [...attempts, a('2026-09-02', true)];
    expect(computeSchedulerState(attempts, '2026-08-25').dueDate).toBe('2026-09-05'); // +3
    attempts = [...attempts, a('2026-09-05', true)];
    expect(computeSchedulerState(attempts, '2026-08-25').dueDate).toBe('2026-09-12'); // +7
    attempts = [...attempts, a('2026-09-12', true)];
    expect(computeSchedulerState(attempts, '2026-08-25').dueDate).toBe('2026-10-03'); // +21
  });

  it('multiplies by ease beyond the ladder', () => {
    const attempts = [
      a('2026-09-01', true),
      a('2026-09-02', true),
      a('2026-09-05', true),
      a('2026-09-12', true),
      a('2026-10-03', true),
    ];
    const state = computeSchedulerState(attempts, '2026-08-25');
    // ease 2.5, interval round(21 * 2.5) = 53.
    expect(state.intervalDays).toBe(53);
    expect(state.dueDate).toBe('2026-11-25');
  });

  it('a miss resets short, counts a lapse, and dents ease', () => {
    const attempts = [a('2026-09-01', true), a('2026-09-02', true), a('2026-09-05', false)];
    const state = computeSchedulerState(attempts, '2026-08-25');
    expect(state.intervalDays).toBe(1);
    expect(state.lapses).toBe(1);
    expect(state.ease).toBe(2.3);
    expect(state.dueDate).toBe('2026-09-06');
  });

  it('ease never falls below the floor', () => {
    const attempts = Array.from({ length: 10 }, (_, i) => a(`2026-09-${String(i + 1).padStart(2, '0')}`, false));
    expect(computeSchedulerState(attempts, '2026-08-25').ease).toBe(1.3);
  });

  it('a correct GUESS holds the interval instead of advancing -- luck is not knowledge', () => {
    const attempts = [a('2026-09-01', true), a('2026-09-02', true)]; // interval now 3
    const held = computeSchedulerState([...attempts, a('2026-09-05', true, 'guessing')], '2026-08-25');
    expect(held.intervalDays).toBe(3); // held, not 7
    expect(held.dueDate).toBe('2026-09-08');
  });

  it('a sure correct nudges ease up, capped', () => {
    const state = computeSchedulerState(
      Array.from({ length: 15 }, (_, i) => a(`2026-09-${String(i + 1).padStart(2, '0')}`, true, 'sure')),
      '2026-08-25',
    );
    expect(state.ease).toBeLessThanOrEqual(3.0);
  });

  it('replays out-of-order input by date, so storage order never changes the answer', () => {
    const shuffled = [a('2026-09-05', true), a('2026-09-01', true), a('2026-09-02', true)];
    const ordered = [a('2026-09-01', true), a('2026-09-02', true), a('2026-09-05', true)];
    expect(computeSchedulerState(shuffled, '2026-08-25')).toEqual(computeSchedulerState(ordered, '2026-08-25'));
  });
});

describe('buildDueQueue', () => {
  const q = (questionId: number, courseId: number, attempts: AttemptEntry[] = [], topic: string | null = null): QueueQuestion => ({
    questionId,
    courseId,
    topic,
    createdDate: '2026-08-20',
    attempts,
  });

  it('includes only questions due today or earlier', () => {
    const queue = buildDueQueue(
      [q(1, 1), q(2, 1, [a('2026-08-24', true)])], // q2 due 08-25
      '2026-08-25',
    );
    expect(queue.map((i) => i.questionId)).toContain(1);
    expect(queue.map((i) => i.questionId)).toContain(2);
    const future = buildDueQueue([q(3, 1, [a('2026-08-25', true, 'sure')])], '2026-08-25'); // due 08-26
    expect(future).toEqual([]);
  });

  it('interleaves courses round-robin within an equal due date', () => {
    const queue = buildDueQueue([q(1, 1), q(2, 1), q(3, 2), q(4, 2)], '2026-08-25');
    const courses = queue.map((i) => i.courseId);
    expect(courses).toEqual([1, 2, 1, 2]);
  });

  it('orders more-overdue questions first across dates', () => {
    const queue = buildDueQueue(
      [q(1, 1, [a('2026-08-23', false)]), q(2, 1, [a('2026-08-20', false)])], // due 08-24 vs 08-21
      '2026-08-25',
    );
    expect(queue.map((i) => i.questionId)).toEqual([2, 1]);
  });

  it('weighted topics jump the whole queue, deterministically', () => {
    const queue = buildDueQueue(
      [q(1, 1, [a('2026-08-20', false)]), q(2, 2, [], 'confounding variables')],
      '2026-08-25',
      new Set(['confounding variables']),
    );
    expect(queue[0]!.questionId).toBe(2);
    expect(queue[0]!.weighted).toBe(true);
  });
});

describe('confidence calibration', () => {
  const ca = (courseId: number, correct: boolean, confidence: CourseAttempt['confidence'], localDate = '2026-08-25', topic: string | null = null): CourseAttempt => ({
    courseId,
    correct,
    confidence,
    localDate,
    topic,
  });

  it('flags a course only past both the rate threshold AND the sample floor', () => {
    // 2 of 6 sure are wrong: 33% > 15%, sample 6 >= 5 -> flagged.
    const flagged = computeCourseCalibration([
      ...Array.from({ length: 4 }, () => ca(1, true, 'sure')),
      ca(1, false, 'sure'),
      ca(1, false, 'sure'),
    ]);
    expect(flagged[0]!.flagged).toBe(true);

    // 1 of 3 sure wrong: 33% but sample 3 < 5 -> noise, not a flag.
    const smallSample = computeCourseCalibration([ca(2, true, 'sure'), ca(2, true, 'sure'), ca(2, false, 'sure')]);
    expect(smallSample[0]!.flagged).toBe(false);
  });

  it('ignores thinkso/guessing taps entirely -- the rule is about misplaced certainty', () => {
    const result = computeCourseCalibration([
      ...Array.from({ length: 10 }, () => ca(1, false, 'guessing')),
    ]);
    expect(result).toEqual([]);
  });

  it('weightedTopics returns topics with recent sure-but-wrong, and forgets old ones', () => {
    const topics = weightedTopics(
      [
        ca(1, false, 'sure', '2026-08-20', 'sampling bias'),
        ca(1, false, 'sure', '2026-07-01', 'ancient history'),
        ca(1, false, 'guessing', '2026-08-20', 'not this one'),
      ],
      '2026-08-25',
    );
    expect(topics.has('sampling bias')).toBe(true);
    expect(topics.has('ancient history')).toBe(false);
    expect(topics.has('not this one')).toBe(false);
  });
});
