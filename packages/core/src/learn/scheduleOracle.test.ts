import { describe, expect, it } from 'vitest';
import {
  emptySchedule,
  nextSchedule,
  scheduleFromLog,
  type CardSchedule,
  type LessonRating,
  type ReviewRecord,
} from './scheduler';

/**
 * D47's oracle, layer one: **the stored state must equal a replay of the log that produced it.**
 *
 * Two paths compute the same thing and must never disagree:
 *
 *   - `nextSchedule`, folded review by review over a stored state — the WRITE path, what
 *     `submit_learn_review` persists into `card_states`.
 *   - `scheduleFromLog`, replaying the whole history from nothing — the ORACLE, and until D47 the
 *     only path there was.
 *
 * They share `ts-fsrs` and they share nothing else: one carries state across calls through the
 * seven columns `card_states` actually has, the other never persists anything. That difference is
 * the entire point. A field that FSRS needs and `card_states` does not store shows up here as a
 * divergence and nowhere else — not in a type error, not in a constraint, and not in the UI until
 * months of wrong due dates have accumulated. It is how `learning_steps` was found.
 *
 * `packages/api/src/data/learnOracle.test.ts` is layer two: the same claim, but driven through the
 * real data layer against a transcription of migration 60's SQL, so the columns and the JSON
 * payload are exercised too.
 */

/** Deterministic PRNG — a seeded test that fails must fail again on the next run (D14). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RATINGS: LessonRating[] = ['again', 'hard', 'good', 'easy'];

/**
 * Gaps chosen to straddle the phases FSRS treats differently, because a log of well-spaced daily
 * reviews would never leave the review state and would therefore never exercise the learning-step
 * ladder that the two paths can disagree about.
 */
const GAP_MINUTES = [1, 6, 11, 25, 60, 240, 1_440, 4_320, 20_160, 129_600];

function randomLog(seed: number, length: number): ReviewRecord[] {
  const rand = mulberry32(seed);
  const log: ReviewRecord[] = [];
  let at = Date.parse('2026-01-04T08:00:00.000Z');
  for (let i = 0; i < length; i += 1) {
    at += GAP_MINUTES[Math.floor(rand() * GAP_MINUTES.length)]! * 60_000;
    log.push({
      reviewedAt: new Date(at).toISOString(),
      rating: RATINGS[Math.floor(rand() * RATINGS.length)]!,
    });
  }
  return log;
}

/** The write path: exactly what the RPC stores, one review at a time, carrying only columns. */
function foldStoredState(cardId: number, log: ReviewRecord[], retention?: number): CardSchedule {
  let stored = emptySchedule(cardId);
  for (const review of log) {
    stored = nextSchedule(stored, review, retention);
    // Round-trip through the column set migration 60 actually has. Anything `nextSchedule`
    // returned that is NOT one of these columns is lost here, which is the whole point: this is
    // what the next review would really be handed after a page reload.
    stored = {
      cardId: stored.cardId,
      state: stored.state,
      dueAt: stored.dueAt,
      stability: stored.stability,
      difficulty: stored.difficulty,
      reps: stored.reps,
      lapses: stored.lapses,
      learningSteps: stored.learningSteps,
      lastReviewedAt: stored.lastReviewedAt,
    };
  }
  return stored;
}

describe('D47 — stored card_states equals a replay of its log', () => {
  it('agrees on a hand-written history that crosses learning, review and relearning', () => {
    const log: ReviewRecord[] = [
      { reviewedAt: '2026-01-04T08:00:00.000Z', rating: 'good' },
      { reviewedAt: '2026-01-04T08:10:00.000Z', rating: 'again' },
      { reviewedAt: '2026-01-04T08:11:00.000Z', rating: 'hard' },
      { reviewedAt: '2026-01-04T08:30:00.000Z', rating: 'good' },
      { reviewedAt: '2026-01-06T08:00:00.000Z', rating: 'good' },
      { reviewedAt: '2026-01-20T08:00:00.000Z', rating: 'again' },
      { reviewedAt: '2026-01-20T08:20:00.000Z', rating: 'good' },
      { reviewedAt: '2026-02-01T08:00:00.000Z', rating: 'easy' },
    ];
    expect(foldStoredState(7, log)).toEqual(scheduleFromLog(7, log));
  });

  it('agrees across 200 randomised histories', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const log = randomLog(seed, 1 + (seed % 14));
      expect({ seed, ...foldStoredState(42, log) }).toEqual({ seed, ...scheduleFromLog(42, log) });
    }
  });

  it('agrees at a non-default desired retention, which changes every interval', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const log = randomLog(seed + 5_000, 8);
      expect(foldStoredState(3, log, 0.95)).toEqual(scheduleFromLog(3, log, 0.95));
      expect(foldStoredState(3, log, 0.8)).toEqual(scheduleFromLog(3, log, 0.8));
    }
  });

  it('agrees after every prefix, not only at the end', () => {
    // A divergence that cancels itself out by the last review would pass the tests above. Checking
    // every prefix is what makes this a statement about the invariant rather than about one point.
    const log = randomLog(99, 12);
    for (let length = 0; length <= log.length; length += 1) {
      const prefix = log.slice(0, length);
      expect(foldStoredState(1, prefix)).toEqual(scheduleFromLog(1, prefix));
    }
  });

  it('THE GUARD ITSELF: dropping learning_steps from the stored columns breaks the agreement', () => {
    // The test that proves the test works. `learning_steps` is the field that is NOT recoverable
    // from the other six, and is absent from the ULM `card_states` this was ported from. If a
    // future edit "simplifies" it out of the table, the assertions above start failing — this one
    // says so out loud, so the next reader knows the column is load-bearing rather than
    // decorative.
    const log: ReviewRecord[] = [
      { reviewedAt: '2026-01-04T08:00:00.000Z', rating: 'again' },
      { reviewedAt: '2026-01-04T08:01:00.000Z', rating: 'good' },
      { reviewedAt: '2026-01-04T08:11:00.000Z', rating: 'hard' },
      { reviewedAt: '2026-01-04T08:22:00.000Z', rating: 'good' },
      { reviewedAt: '2026-01-04T08:45:00.000Z', rating: 'again' },
      { reviewedAt: '2026-01-04T09:00:00.000Z', rating: 'again' },
      { reviewedAt: '2026-01-04T09:20:00.000Z', rating: 'good' },
      { reviewedAt: '2026-01-05T09:00:00.000Z', rating: 'good' },
    ];

    let lossy = emptySchedule(5);
    for (const review of log) lossy = { ...nextSchedule(lossy, review), learningSteps: 0 };

    const truth = scheduleFromLog(5, log);
    expect(foldStoredState(5, log)).toEqual(truth);
    expect(lossy).not.toEqual(truth);
  });
});

describe('nextSchedule refuses a log that is not monotonic', () => {
  it('throws rather than silently reordering or ignoring an out-of-order review', () => {
    const first = nextSchedule(emptySchedule(1), { reviewedAt: '2026-01-04T08:00:00.000Z', rating: 'good' });
    expect(() => nextSchedule(first, { reviewedAt: '2026-01-03T08:00:00.000Z', rating: 'good' })).toThrow(
      /not after the previous review/,
    );
    expect(() => nextSchedule(first, { reviewedAt: '2026-01-04T08:00:00.000Z', rating: 'good' })).toThrow(
      /not after the previous review/,
    );
  });

  it('throws on an unparseable timestamp rather than scheduling from a bad date', () => {
    expect(() => nextSchedule(emptySchedule(1), { reviewedAt: 'not a date', rating: 'good' })).toThrow(
      /unparseable/,
    );
  });
});
