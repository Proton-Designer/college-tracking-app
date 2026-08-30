import { scheduleFromLog, type LessonRating } from '@collegeos/core';
import { describe, expect, it } from 'vitest';
import type { TypedSupabaseClient } from '../client/types';
import { countDue, recordReview, scheduleFrom } from './learn';

/**
 * D47's oracle, layer two: **the `card_states` row this data layer writes must equal a replay of
 * the `lesson_reviews` rows it wrote alongside it.**
 *
 * Layer one (`packages/core/src/learn/scheduleOracle.test.ts`) proves the two scheduling functions
 * agree. This one proves the PLUMBING between them does — the JSON payload the RPC is handed, the
 * column names it writes, the timestamp it records, and the mapping back out on the next read. A
 * misspelled key in `p_next_state`, a column left out of `CARD_STATE_COLUMNS`, or a review logged
 * at a different instant than the one its schedule was computed at all show up here, and none of
 * them would show up in layer one.
 *
 * The fake below is not a mock that records calls. It is a transcription of migration 60's
 * `submit_learn_review` — every validation, in the order the SQL performs them — written from the
 * SQL rather than from `recordReview`, so the two sides share no code. That is ULM's own
 * independently-written-oracle technique, the one that verified 61 days of streak logic against SQL
 * that shared nothing with it. It is also the only way to exercise the RPC at all: no database is
 * reachable from this machine, and a fake that simply accepted whatever it was handed would prove
 * that `recordReview` can call a function.
 *
 * What it CANNOT prove, stated so nobody reads more into a green run than is there: that the
 * transcription matches the deployed SQL. Only pgTAP against a real database closes that, and that
 * is Docker work this machine cannot do. What it does prove is that the write path, the read path
 * and the replay agree — which is the part that was actually at risk.
 */

// ---------------------------------------------------------------------------
// A transcription of migration 60's submit_learn_review, plus the two tables it touches.
// ---------------------------------------------------------------------------

interface CardStateRowLike {
  card_id: number;
  user_id: string;
  stability: number | null;
  difficulty: number | null;
  due_at: string | null;
  reps: number;
  lapses: number;
  state: 'new' | 'learning' | 'review' | 'relearning';
  learning_steps: number;
  last_review_at: string | null;
  last_rating: LessonRating | null;
}

interface ReviewRowLike {
  id: number;
  user_id: string;
  card_id: number;
  rating: LessonRating;
  reviewed_at: string;
  local_date: string;
  session_id: number | null;
  elapsed_ms: number | null;
  answered_text: string | null;
  ai_feedback: string | null;
}

class SqlstateError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

interface FakeDb {
  states: Map<number, CardStateRowLike>;
  reviews: ReviewRowLike[];
  /** The server's clock, held still so `due_at > now()` is a decision rather than a race. */
  now: Date;
}

/** Line-for-line with the migration's `begin ... end`, deliberately dumb. */
function submitLearnReview(
  db: FakeDb,
  caller: string | null,
  args: Record<string, unknown>,
): ReviewRowLike {
  if (caller === null) throw new SqlstateError('LR001', 'no authenticated caller');
  const rating = args.p_rating as LessonRating | null;
  if (rating == null) throw new SqlstateError('LR002', 'rating is required');

  const prev = db.states.get(args.p_card_id as number);
  if (!prev || prev.user_id !== caller) {
    throw new SqlstateError('LR003', 'no card_states row for card and caller');
  }

  const next = (args.p_next_state ?? {}) as Record<string, unknown>;
  const state = next.state as CardStateRowLike['state'] | undefined;
  const reps = next.reps as number | undefined;
  const stability = next.stability as number | undefined;
  const difficulty = next.difficulty as number | undefined;
  const dueAt = next.due_at as string | undefined;
  const learningSteps = next.learning_steps as number | undefined;
  const lapses = next.lapses as number | undefined;
  const reviewedAt = args.p_reviewed_at as string | undefined;

  if (state == null) throw new SqlstateError('LR007', 'next state is required');
  if (state === 'new') throw new SqlstateError('LR008', 'a reviewed card cannot return to new');
  if (prev.state === 'new' && state !== 'learning' && state !== 'review') {
    throw new SqlstateError('LR008', `illegal transition new -> ${state}`);
  }
  if (reps == null || reps !== prev.reps + 1) {
    throw new SqlstateError('LR004', 'reps must increase by exactly 1');
  }
  if (stability == null || stability <= 0) throw new SqlstateError('LR005', 'stability must be > 0');
  if (difficulty == null) throw new SqlstateError('LR005', 'difficulty is required');
  if (dueAt == null || Date.parse(dueAt) <= db.now.getTime()) {
    throw new SqlstateError('LR006', 'due_at must be in the future');
  }
  if (learningSteps == null || learningSteps < 0) {
    throw new SqlstateError('LR009', 'learning_steps must be >= 0');
  }
  if (
    lapses == null ||
    lapses < prev.lapses ||
    lapses > prev.lapses + 1 ||
    (lapses === prev.lapses + 1 && rating !== 'again')
  ) {
    throw new SqlstateError('LR010', 'lapses moved illegally');
  }
  if (
    reviewedAt == null ||
    Date.parse(reviewedAt) > db.now.getTime() ||
    (prev.last_review_at !== null && Date.parse(reviewedAt) <= Date.parse(prev.last_review_at))
  ) {
    throw new SqlstateError('LR011', 'reviewed_at is outside (previous review, now]');
  }

  const inserted: ReviewRowLike = {
    id: db.reviews.length + 1,
    user_id: caller,
    card_id: prev.card_id,
    rating,
    // Postgres hands timestamptz back with a `+00:00` offset, not a `Z`. Reproduced, because a
    // read path that only works on the spelling it wrote is a read path that breaks in production.
    reviewed_at: new Date(reviewedAt).toISOString().replace('Z', '+00:00'),
    local_date: args.p_local_date as string,
    session_id: (args.p_session_id as number | undefined) ?? null,
    elapsed_ms: (args.p_elapsed_ms as number | undefined) ?? null,
    answered_text: (args.p_answered_text as string | undefined) ?? null,
    ai_feedback: (args.p_ai_feedback as string | undefined) ?? null,
  };
  db.reviews.push(inserted);

  db.states.set(prev.card_id, {
    ...prev,
    stability,
    difficulty,
    due_at: new Date(dueAt).toISOString().replace('Z', '+00:00'),
    reps,
    lapses,
    state,
    learning_steps: learningSteps,
    last_review_at: inserted.reviewed_at,
    last_rating: rating,
  });

  return inserted;
}

// ---------------------------------------------------------------------------
// The narrow slice of PostgREST that `learn.ts` actually uses.
// ---------------------------------------------------------------------------

function fakeClient(db: FakeDb, caller: string): TypedSupabaseClient {
  const client = {
    from(table: string) {
      if (table !== 'card_states') throw new Error(`fakeClient: unexpected table ${table}`);
      const filters: Record<string, unknown> = {};
      let counting = false;
      const builder = {
        select(_columns: string, options?: { count?: string; head?: boolean }) {
          counting = options?.count != null;
          return builder;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        neq(column: string, value: unknown) {
          filters[`neq:${column}`] = value;
          return builder;
        },
        lte(column: string, value: unknown) {
          filters[`lte:${column}`] = value;
          return builder;
        },
        maybeSingle() {
          const row = db.states.get(filters.card_id as number);
          const match = row && row.user_id === filters.user_id ? row : null;
          return Promise.resolve({ data: match, error: null });
        },
        then(resolve: (value: { data: unknown; error: null; count?: number }) => unknown) {
          const rows = [...db.states.values()].filter((row) => {
            if (filters.user_id != null && row.user_id !== filters.user_id) return false;
            if (filters['neq:state'] != null && row.state === filters['neq:state']) return false;
            if (filters['lte:due_at'] != null) {
              if (row.due_at === null) return false;
              if (Date.parse(row.due_at) > Date.parse(filters['lte:due_at'] as string)) return false;
            }
            return true;
          });
          return Promise.resolve(
            resolve(counting ? { data: null, error: null, count: rows.length } : { data: rows, error: null }),
          );
        },
      };
      return builder;
    },
    rpc(name: string, args: Record<string, unknown>) {
      if (name !== 'submit_learn_review') throw new Error(`fakeClient: unexpected rpc ${name}`);
      try {
        return Promise.resolve({ data: submitLearnReview(db, caller, args), error: null });
      } catch (err) {
        const code = err instanceof SqlstateError ? err.code : 'XX000';
        return Promise.resolve({
          data: null,
          error: { code, message: (err as Error).message, details: '', hint: '', name: 'PostgrestError' },
        });
      }
    },
  };
  return client as unknown as TypedSupabaseClient;
}

const USER = '11111111-1111-4111-8111-111111111111';

function freshDb(now: Date): FakeDb {
  return {
    states: new Map([
      [
        1,
        {
          card_id: 1,
          user_id: USER,
          stability: null,
          difficulty: null,
          due_at: null,
          reps: 0,
          lapses: 0,
          state: 'new' as const,
          learning_steps: 0,
          last_review_at: null,
          last_rating: null,
        },
      ],
    ]),
    reviews: [],
    now,
  };
}

const RATINGS: LessonRating[] = ['again', 'hard', 'good', 'easy'];
const GAP_MINUTES = [2, 9, 30, 90, 1_440, 7_200, 43_200];

describe('D47 — the data layer writes a card_states row equal to a replay of its own log', () => {
  it('agrees after a twenty-review session driven entirely through recordReview', async () => {
    const db = freshDb(new Date('2026-03-01T09:00:00.000Z'));
    const client = fakeClient(db, USER);

    let at = Date.parse('2026-03-01T09:00:00.000Z');
    for (let i = 0; i < 20; i += 1) {
      at += GAP_MINUTES[i % GAP_MINUTES.length]! * 60_000;
      // The server clock has to be at or past the review instant, exactly as it would be in
      // production; LR011 rejects a review from the future.
      db.now = new Date(at);
      const result = await recordReview(
        client,
        USER,
        { cardId: 1, rating: RATINGS[(i * 3) % RATINGS.length]!, localDate: '2026-03-01', desiredRetention: 0.9 },
        new Date(at),
      );
      expect(result.ok, `review ${i} was rejected`).toBe(true);
    }

    expect(db.reviews).toHaveLength(20);

    // THE ASSERTION. Everything above is setup.
    const stored = scheduleFrom(db.states.get(1)!);
    const replayed = scheduleFromLog(
      1,
      db.reviews.map((row) => ({ reviewedAt: row.reviewed_at, rating: row.rating })),
      0.9,
    );
    expect(stored).toEqual(replayed);
  });

  it('agrees at every point in the session, not only at the end', async () => {
    const db = freshDb(new Date('2026-03-01T09:00:00.000Z'));
    const client = fakeClient(db, USER);

    let at = Date.parse('2026-03-01T09:00:00.000Z');
    for (let i = 0; i < 12; i += 1) {
      at += GAP_MINUTES[(i * 5) % GAP_MINUTES.length]! * 60_000;
      db.now = new Date(at);
      const result = await recordReview(
        client,
        USER,
        { cardId: 1, rating: RATINGS[(i * 2 + 1) % RATINGS.length]!, localDate: '2026-03-01', desiredRetention: 0.9 },
        new Date(at),
      );
      expect(result.ok).toBe(true);

      const stored = scheduleFrom(db.states.get(1)!);
      const replayed = scheduleFromLog(
        1,
        db.reviews.map((row) => ({ reviewedAt: row.reviewed_at, rating: row.rating })),
        0.9,
      );
      expect(stored, `state and log disagreed after review ${i + 1}`).toEqual(replayed);
    }
  });

  it('agrees at a non-default desired retention', async () => {
    const db = freshDb(new Date('2026-03-01T09:00:00.000Z'));
    const client = fakeClient(db, USER);

    let at = Date.parse('2026-03-01T09:00:00.000Z');
    for (let i = 0; i < 10; i += 1) {
      at += GAP_MINUTES[i % GAP_MINUTES.length]! * 60_000;
      db.now = new Date(at);
      await recordReview(
        client,
        USER,
        { cardId: 1, rating: RATINGS[i % RATINGS.length]!, localDate: '2026-03-01', desiredRetention: 0.95 },
        new Date(at),
      );
    }

    expect(scheduleFrom(db.states.get(1)!)).toEqual(
      scheduleFromLog(1, db.reviews.map((row) => ({ reviewedAt: row.reviewed_at, rating: row.rating })), 0.95),
    );
  });
});

describe('the RPC refuses states that cannot be right', () => {
  it('rejects a review for a card with no state row, by code and not by message', async () => {
    const db = freshDb(new Date('2026-03-01T09:00:00.000Z'));
    const result = await recordReview(
      fakeClient(db, USER),
      USER,
      { cardId: 999, rating: 'good', localDate: '2026-03-01', desiredRetention: 0.9 },
      new Date('2026-03-01T09:00:00.000Z'),
    );
    expect(result).toEqual({ ok: false, error: { code: 'not_found', message: expect.any(String) } });
  });

  it('rejects a review that is not after the previous one rather than reordering it', async () => {
    const db = freshDb(new Date('2026-03-01T10:00:00.000Z'));
    const client = fakeClient(db, USER);
    const first = await recordReview(
      client,
      USER,
      { cardId: 1, rating: 'good', localDate: '2026-03-01', desiredRetention: 0.9 },
      new Date('2026-03-01T10:00:00.000Z'),
    );
    expect(first.ok).toBe(true);

    // A clock that went backwards, or an offline queue replayed out of order.
    const backwards = await recordReview(
      client,
      USER,
      { cardId: 1, rating: 'good', localDate: '2026-03-01', desiredRetention: 0.9 },
      new Date('2026-03-01T09:00:00.000Z'),
    );
    expect(backwards.ok).toBe(false);
    expect(db.reviews).toHaveLength(1);
  });

  it('rejects a tampered next state — reps off by more than one — with SQLSTATE LR004', () => {
    // Straight at the transcription: this is the shape a replayed offline queue produces, and the
    // only thing standing between it and a card_states row that no longer matches its log.
    const db = freshDb(new Date('2026-03-01T09:00:00.000Z'));
    expect(() =>
      submitLearnReview(db, USER, {
        p_card_id: 1,
        p_rating: 'good',
        p_local_date: '2026-03-01',
        p_reviewed_at: '2026-03-01T09:00:00.000Z',
        p_next_state: {
          state: 'learning',
          reps: 7,
          stability: 1,
          difficulty: 5,
          due_at: '2026-03-02T09:00:00.000Z',
          learning_steps: 0,
          lapses: 0,
        },
      }),
    ).toThrow(expect.objectContaining({ code: 'LR004' }));
  });

  it('rejects a lapse count that moved without an "again" — the check ULM derives instead', () => {
    // ULM's RPC computes `lapses = prev.lapses + 1 when rating = again`, which disagrees with
    // ts-fsrs (it counts a lapse only for Again in the REVIEW state, never inside learning). We
    // take the caller's value and BOUND it instead, so the stored count can still match a replay.
    const db = freshDb(new Date('2026-03-01T09:00:00.000Z'));
    expect(() =>
      submitLearnReview(db, USER, {
        p_card_id: 1,
        p_rating: 'good',
        p_local_date: '2026-03-01',
        p_reviewed_at: '2026-03-01T09:00:00.000Z',
        p_next_state: {
          state: 'learning',
          reps: 1,
          stability: 1,
          difficulty: 5,
          due_at: '2026-03-02T09:00:00.000Z',
          learning_steps: 0,
          lapses: 1,
        },
      }),
    ).toThrow(expect.objectContaining({ code: 'LR010' }));
  });

  it('rejects an unauthenticated caller with LR001', () => {
    const db = freshDb(new Date('2026-03-01T09:00:00.000Z'));
    expect(() => submitLearnReview(db, null, { p_card_id: 1, p_rating: 'good' })).toThrow(
      expect.objectContaining({ code: 'LR001' }),
    );
  });
});

describe('countDue', () => {
  it('counts stored due rows and never a new card', async () => {
    const db = freshDb(new Date('2026-03-01T09:00:00.000Z'));
    db.states.set(2, {
      card_id: 2,
      user_id: USER,
      stability: 3,
      difficulty: 5,
      due_at: '2026-02-01T09:00:00+00:00',
      reps: 4,
      lapses: 0,
      state: 'review',
      learning_steps: 0,
      last_review_at: '2026-01-01T09:00:00+00:00',
      last_rating: 'good',
    });
    db.states.set(3, {
      card_id: 3,
      user_id: USER,
      stability: 3,
      difficulty: 5,
      due_at: '2026-12-01T09:00:00+00:00',
      reps: 4,
      lapses: 0,
      state: 'review',
      learning_steps: 0,
      last_review_at: '2026-01-01T09:00:00+00:00',
      last_rating: 'good',
    });

    // Card 1 is new (no due_at), card 2 is overdue, card 3 is not yet due.
    const result = await countDue(fakeClient(db, USER), USER, new Date('2026-03-01T09:00:00.000Z'));
    expect(result).toEqual({ ok: true, data: 1 });
  });
});
