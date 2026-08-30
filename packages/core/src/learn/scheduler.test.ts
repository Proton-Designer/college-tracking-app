import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DESIRED_RETENTION,
  LAPSE_DAYS,
  buildSession,
  comebackState,
  isDue,
  retrievability,
  scheduleFromLog,
  sourceStrength,
  type ReviewRecord,
  type SessionCard,
} from './scheduler';

function card(cardId: number, sourceId: number, reviews: ReviewRecord[], lessonId = cardId): SessionCard {
  return { cardId, lessonId, sourceId, schedule: scheduleFromLog(cardId, reviews) };
}

const GOOD = (reviewedAt: string): ReviewRecord => ({ reviewedAt, rating: 'good' });
const AGAIN = (reviewedAt: string): ReviewRecord => ({ reviewedAt, rating: 'again' });

describe('scheduleFromLog', () => {
  it('reports a never-reviewed card as new, with nulls rather than zeros', () => {
    // A new card has no memory strength and no due date. Zeros here would claim measurements that
    // were never taken.
    const schedule = scheduleFromLog(1, []);
    expect(schedule.state).toBe('new');
    expect(schedule.dueAt).toBeNull();
    expect(schedule.stability).toBeNull();
    expect(schedule.difficulty).toBeNull();
    expect(schedule.reps).toBe(0);
  });

  it('is deterministic: the same log always produces the same due date', () => {
    // The whole derive-don't-store design rests on this. FSRS's fuzz is disabled for exactly this
    // reason -- with it on, replaying one history would give a different answer on every render.
    const log = [GOOD('2026-06-01T10:00:00Z'), GOOD('2026-06-04T10:00:00Z')];
    expect(scheduleFromLog(1, log).dueAt).toBe(scheduleFromLog(1, log).dueAt);
  });

  it('replays out-of-order reviews in chronological order', () => {
    const forward = [GOOD('2026-06-01T10:00:00Z'), GOOD('2026-06-04T10:00:00Z')];
    const shuffled = [forward[1]!, forward[0]!];
    expect(scheduleFromLog(1, shuffled)).toEqual(scheduleFromLog(1, forward));
  });

  it('grows the interval on repeated success', () => {
    const once = scheduleFromLog(1, [GOOD('2026-06-01T10:00:00Z')]);
    const thrice = scheduleFromLog(1, [
      GOOD('2026-06-01T10:00:00Z'),
      GOOD('2026-06-03T10:00:00Z'),
      GOOD('2026-06-10T10:00:00Z'),
    ]);
    expect(thrice.stability!).toBeGreaterThan(once.stability!);
    expect(thrice.reps).toBe(3);
  });

  it('records a lapse and shortens the schedule on Again', () => {
    const log = [
      GOOD('2026-06-01T10:00:00Z'),
      GOOD('2026-06-05T10:00:00Z'),
      GOOD('2026-06-15T10:00:00Z'),
    ];
    const clean = scheduleFromLog(1, log);
    const lapsed = scheduleFromLog(1, [...log, AGAIN('2026-06-30T10:00:00Z')]);
    expect(lapsed.lapses).toBe(1);
    expect(clean.lapses).toBe(0);
    expect(lapsed.stability!).toBeLessThan(clean.stability!);
    expect(lapsed.state).toBe('relearning');
  });

  it('produces longer intervals at a lower desired retention', () => {
    // The retention target is the one FSRS knob a user could reasonably be given, so it must
    // actually do something.
    const log = [GOOD('2026-06-01T10:00:00Z'), GOOD('2026-06-05T10:00:00Z')];
    const strict = scheduleFromLog(1, log, 0.95);
    const relaxed = scheduleFromLog(1, log, 0.8);
    expect(Date.parse(relaxed.dueAt!)).toBeGreaterThan(Date.parse(strict.dueAt!));
    expect(DEFAULT_DESIRED_RETENTION).toBe(0.9);
  });

  it('stops at an unparseable timestamp rather than silently skipping it', () => {
    // Skipping would compute a schedule from part of the history and present it as the whole one.
    const partial = scheduleFromLog(1, [
      GOOD('2026-06-01T10:00:00Z'),
      { reviewedAt: 'not-a-date', rating: 'good' },
      GOOD('2026-06-20T10:00:00Z'),
    ]);
    expect(partial.reps).toBe(1);
    expect(partial.lastReviewedAt).toBe('2026-06-01T10:00:00Z');
  });
});

describe('retrievability', () => {
  it('is null for a card never reviewed', () => {
    // 0% would say "you have forgotten this" about something never learned.
    expect(retrievability(scheduleFromLog(1, []), new Date('2026-06-01T10:00:00Z'))).toBeNull();
  });

  it('is near certain immediately after a review and decays with time', () => {
    const schedule = scheduleFromLog(1, [GOOD('2026-06-01T10:00:00Z')]);
    const immediately = retrievability(schedule, new Date('2026-06-01T10:00:01Z'))!;
    const aWeekLater = retrievability(schedule, new Date('2026-06-08T10:00:00Z'))!;
    const aYearLater = retrievability(schedule, new Date('2027-06-01T10:00:00Z'))!;
    expect(immediately).toBeGreaterThan(0.99);
    expect(aWeekLater).toBeLessThan(immediately);
    expect(aYearLater).toBeLessThan(aWeekLater);
    expect(aYearLater).toBeGreaterThan(0);
  });

  it('never reaches zero, matching the curve it models', () => {
    const schedule = scheduleFromLog(1, [GOOD('2026-06-01T10:00:00Z')]);
    expect(retrievability(schedule, new Date('2036-06-01T10:00:00Z'))!).toBeGreaterThan(0);
  });
});

describe('buildSession', () => {
  const now = new Date('2026-06-20T10:00:00Z');
  const dueA1 = card(1, 100, [GOOD('2026-06-01T10:00:00Z')]);
  const dueA2 = card(2, 100, [GOOD('2026-06-02T10:00:00Z')]);
  const dueB1 = card(3, 200, [GOOD('2026-06-01T12:00:00Z')]);
  const freshA = card(4, 100, []);
  const freshB = card(5, 200, []);

  it('interleaves due cards across sources rather than blocking by source', () => {
    // A source's cards are introduced together and therefore ripen together, so a plain due-date
    // sort reliably groups them -- which is what lets a reader coast on context. Three cards from
    // each of two sources, all due: a blocked queue would read AAABBB, a round-robin ABABAB.
    const sourceA = [11, 12, 13].map((id, i) => card(id, 100, [GOOD(`2026-06-0${i + 1}T10:00:00Z`)]));
    const sourceB = [21, 22, 23].map((id, i) => card(id, 200, [GOOD(`2026-06-0${i + 1}T11:00:00Z`)]));
    const plan = buildSession([...sourceA, ...sourceB], { newLimit: 0, now });

    const queue = [plan.warmUp!, ...plan.due];
    expect(queue).toHaveLength(6);
    // No source may appear three times in a row -- that is the blocking this rule exists to stop.
    for (let i = 2; i < queue.length; i += 1) {
      const run = queue[i]!.sourceId === queue[i - 1]!.sourceId && queue[i - 1]!.sourceId === queue[i - 2]!.sourceId;
      expect(run).toBe(false);
    }
  });

  it('opens with a due card, for momentum', () => {
    const plan = buildSession([dueA1, dueB1], { newLimit: 3, now });
    expect(plan.warmUp).not.toBeNull();
    expect(plan.due.some((c) => c.cardId === plan.warmUp!.cardId)).toBe(false);
  });

  it('withholds new lessons while anything is due', () => {
    // Introducing new material against a backlog trades retention for the feeling of progress --
    // the exact failure the product exists to avoid.
    const plan = buildSession([dueA1, freshA, freshB], { newLimit: 3, now });
    expect(plan.introductions).toEqual([]);
  });

  it('introduces up to the user’s own limit once the queue is clear', () => {
    const plan = buildSession([freshA, freshB], { newLimit: 1, now });
    expect(plan.introductions).toHaveLength(1);
    expect(plan.warmUp).toBeNull();
  });

  it('respects a limit of zero rather than treating it as unset', () => {
    expect(buildSession([freshA, freshB], { newLimit: 0, now }).introductions).toEqual([]);
  });

  it('produces an empty session when there is genuinely nothing to do', () => {
    // A card in review state with a long interval, NOT one reviewed once -- FSRS puts a
    // first-time card into learning with a minutes-long step, so "reviewed yesterday" is still
    // due today. That is correct scheduling, and assuming otherwise is SM-2 thinking.
    const settled = card(9, 100, [
      GOOD('2026-06-01T10:00:00Z'),
      GOOD('2026-06-01T10:20:00Z'),
      GOOD('2026-06-05T10:00:00Z'),
      GOOD('2026-06-15T10:00:00Z'),
    ]);
    expect(settled.schedule.state).toBe('review');
    expect(isDue(settled.schedule, now)).toBe(false);

    const plan = buildSession([settled], { newLimit: 3, now });
    expect(plan.totalCards).toBe(0);
    expect(plan.warmUp).toBeNull();
  });

  it('brings a card reviewed moments ago back inside the same session', () => {
    // FSRS learning steps are short by design: a card graded Good for the first time returns in
    // minutes, not days. Documented here because it looks like a bug the first time it is seen.
    const justLearned = card(8, 100, [GOOD('2026-06-19T10:00:00Z')]);
    expect(justLearned.schedule.state).toBe('learning');
    expect(isDue(justLearned.schedule, now)).toBe(true);
  });

  it('caps a huge backlog so a session stays completable', () => {
    const many = Array.from({ length: 200 }, (_, i) => card(i + 10, 100, [GOOD('2026-05-01T10:00:00Z')]));
    const plan = buildSession(many, { newLimit: 3, now, maxCards: 30 });
    expect(plan.due.length).toBeLessThanOrEqual(30);
  });
});

describe('isDue', () => {
  it('is false for a new card, which is not due but merely unseen', () => {
    expect(isDue(scheduleFromLog(1, []), new Date('2030-01-01T00:00:00Z'))).toBe(false);
  });

  it('is true once the due instant has passed', () => {
    const schedule = scheduleFromLog(1, [GOOD('2026-06-01T10:00:00Z')]);
    expect(isDue(schedule, new Date(Date.parse(schedule.dueAt!) + 1000))).toBe(true);
    expect(isDue(schedule, new Date(Date.parse(schedule.dueAt!) - 1000))).toBe(false);
  });
});

describe('comebackState -- D29 as a visible moment', () => {
  it('fires only when a real lapse is actually cleared', () => {
    const state = comebackState({
      lastCompletedSessionDate: '2026-06-10',
      today: '2026-06-14',
      dueBeforeSession: 12,
      dueAfterSession: 0,
    });
    expect(state.daysAway).toBe(4);
    expect(state.waiting).toBe(12);
    expect(state.justRecovered).toBe(true);
  });

  it('does not fire for an ordinary good day', () => {
    // Clearing a queue you never let build is a good day, not a comeback. Calling it one would
    // cheapen the moment that matters.
    const state = comebackState({
      lastCompletedSessionDate: '2026-06-13',
      today: '2026-06-14',
      dueBeforeSession: 4,
      dueAfterSession: 0,
    });
    expect(state.justRecovered).toBe(false);
  });

  it('does not fire when the backlog is only partly cleared', () => {
    const state = comebackState({
      lastCompletedSessionDate: '2026-06-01',
      today: '2026-06-14',
      dueBeforeSession: 40,
      dueAfterSession: 12,
    });
    expect(state.justRecovered).toBe(false);
    expect(state.daysAway).toBe(13);
  });

  it('treats a first-ever session as a beginning, not a recovery', () => {
    const state = comebackState({
      lastCompletedSessionDate: null,
      today: '2026-06-14',
      dueBeforeSession: 0,
      dueAfterSession: 0,
    });
    expect(state.daysAway).toBeNull();
    expect(state.justRecovered).toBe(false);
  });

  it('needs a gap of at least the lapse threshold', () => {
    const justUnder = comebackState({
      lastCompletedSessionDate: '2026-06-13',
      today: `2026-06-${13 + LAPSE_DAYS - 1}`,
      dueBeforeSession: 5,
      dueAfterSession: 0,
    });
    expect(justUnder.justRecovered).toBe(false);
  });
});

describe('sourceStrength', () => {
  const now = new Date('2026-06-20T10:00:00Z');

  it('reports null, not zero, for a source never reviewed', () => {
    // An untouched book has no retention to report, and a 0% bar reads as failure at something
    // never attempted.
    const strengths = sourceStrength([card(1, 100, []), card(2, 100, [])], now);
    expect(strengths[0]!.strength).toBeNull();
    expect(strengths[0]!.totalCards).toBe(2);
    expect(strengths[0]!.reviewedCards).toBe(0);
  });

  it('averages only the cards that have actually been reviewed', () => {
    const strengths = sourceStrength(
      [card(1, 100, [GOOD('2026-06-19T10:00:00Z')]), card(2, 100, [])],
      now,
    );
    expect(strengths[0]!.reviewedCards).toBe(1);
    expect(strengths[0]!.totalCards).toBe(2);
    expect(strengths[0]!.strength).toBeGreaterThan(0);
    expect(strengths[0]!.strength).toBeLessThanOrEqual(1);
  });

  it('separates sources', () => {
    const strengths = sourceStrength(
      [card(1, 100, [GOOD('2026-06-19T10:00:00Z')]), card(2, 200, [GOOD('2026-01-01T10:00:00Z')])],
      now,
    );
    expect(strengths).toHaveLength(2);
    const recent = strengths.find((s) => s.sourceId === 100)!;
    const stale = strengths.find((s) => s.sourceId === 200)!;
    expect(recent.strength!).toBeGreaterThan(stale.strength!);
  });
});
