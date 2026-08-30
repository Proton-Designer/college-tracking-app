import {
  buildSession,
  comebackState,
  emptySchedule,
  nextSchedule,
  retrievability,
  sourceStrength,
  type CardSchedule,
  type CardState,
  type ComebackState,
  type LessonRating,
  type LocalDate,
  type SessionCard,
  type SessionPlan,
  type SourceStrength,
} from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type SourceRow = Database['public']['Tables']['sources']['Row'];
export type LessonRow = Database['public']['Tables']['lessons']['Row'];
export type LessonCardRow = Database['public']['Tables']['lesson_cards']['Row'];
export type LessonReviewRow = Database['public']['Tables']['lesson_reviews']['Row'];
export type LearnSessionRow = Database['public']['Tables']['learn_sessions']['Row'];
export type IngestJobRow = Database['public']['Tables']['ingest_jobs']['Row'];
export type CardStateRow = Database['public']['Tables']['card_states']['Row'];

/**
 * The Learn pillar's data layer.
 *
 * **D47: the read path reads `card_states`; the write path appends to `lesson_reviews` and advances
 * `card_states` in one transaction.** `lesson_reviews` is still append-only and still the system of
 * record — nothing here updates or deletes a review — but a card's stability and due date are no
 * longer recomputed on every render.
 *
 * What this replaced, and why it had to go: every read used to fetch the whole review log and
 * replay it, capped at 2,000 rows. The cap did not fail when it was exceeded — it TRUNCATED, and
 * then reported a confidently wrong due count assembled from a suffix of each card's history.
 * A limit that silently produces a plausible wrong answer is worse than either failing or being
 * slow, and it would have arrived quietly a few months into real use. It is gone, and nothing
 * replaced it, because nothing here reads the log in bulk any more.
 *
 * `scheduleFromLog` is still exported from `packages/core` and is still exercised — as the ORACLE
 * that proves this stored state equals a replay of the log that produced it. See
 * `learnOracle.test.ts`.
 */

/** Columns the read path needs from `card_states`. Kept as a constant so every reader asks for the
 *  same set — a missing column here silently becomes a default in `scheduleFrom`. */
const CARD_STATE_COLUMNS = 'card_id, state, due_at, stability, difficulty, reps, lapses, learning_steps, last_review_at';

type StoredCardState = Pick<
  CardStateRow,
  'card_id' | 'state' | 'due_at' | 'stability' | 'difficulty' | 'reps' | 'lapses' | 'learning_steps' | 'last_review_at'
>;

/**
 * Maps a stored row into the shape `packages/core` reasons about.
 *
 * Timestamps are normalised to ISO here rather than passed through: Postgres returns `+00:00`
 * offsets and a client writes `Z`, and the oracle test compares these strings against a replay's.
 */
export function scheduleFrom(row: StoredCardState): CardSchedule {
  if (row.last_review_at === null) return emptySchedule(row.card_id);
  return {
    cardId: row.card_id,
    state: row.state as CardState,
    dueAt: row.due_at === null ? null : new Date(row.due_at).toISOString(),
    stability: row.stability,
    difficulty: row.difficulty,
    reps: row.reps,
    lapses: row.lapses,
    learningSteps: row.learning_steps,
    lastReviewedAt: new Date(row.last_review_at).toISOString(),
  };
}

export interface LearnCard {
  card: LessonCardRow;
  lesson: Pick<LessonRow, 'id' | 'title' | 'core_claim' | 'claim_to_task' | 'provenance_quote' | 'page_ref' | 'source_id'>;
  session: SessionCard;
}

export interface DailySessionView {
  plan: SessionPlan;
  cards: Map<number, LearnCard>;
  comeback: ComebackState;
  strengths: SourceStrength[];
  /** Sources still ingesting with nothing servable yet, so the UI can say why a session is empty. */
  sourcesProcessing: number;
  /** Sources usable before their ingestion finished (ULM ADR-010). Distinct from `ready`: the
   *  library can honestly say "still reading, and here is what it has so far". */
  sourcesPartial: number;
  totalSources: number;
}

/**
 * Assembles today's session.
 *
 * Three queries and no replay: the cards, their stored FSRS state, and the last completed session.
 * The state comes from `card_states` in one pass rather than per card — a per-card query is the
 * quiet quadratic that only shows up once someone has a few hundred cards, which is exactly when
 * the session is supposed to feel fast.
 *
 * PROVISIONAL lessons are served. That is the whole point of progressive availability: a lesson is
 * readable and reviewable as soon as its chunk cleared the provenance gate, without waiting for the
 * whole-source merge. Only `archived` is excluded, and its cards are separately suspended by
 * migration 60's trigger, so the two filters agree by construction rather than by coincidence.
 */
export async function loadDailySession(
  client: TypedSupabaseClient,
  userId: string,
  // No `desiredRetention` here any more: it is an input to a review, not to a read. Every card's
  // due date was computed with the retention in force when it was reviewed, and is stored.
  input: { today: LocalDate; newLimit: number },
  now: Date = new Date(),
): Promise<DataResult<DailySessionView>> {
  const { data: sources, error: sourcesError } = await client
    .from('sources')
    .select('id, status')
    .eq('user_id', userId);
  if (sourcesError) return dataErr(mapDataError(sourcesError));

  const { data: cardRows, error: cardsError } = await client
    .from('lesson_cards')
    .select(
      'id, lesson_id, prompt_type, prompt, answer, sort_order, active, suspended_at, created_at, updated_at, user_id, lessons!inner(id, title, core_claim, claim_to_task, provenance_quote, page_ref, source_id, status)',
    )
    .eq('user_id', userId)
    .eq('active', true)
    .is('suspended_at', null);
  if (cardsError) return dataErr(mapDataError(cardsError));

  type Joined = LessonCardRow & { lessons: LearnCard['lesson'] & { status: LessonRow['status'] } };
  const joined = ((cardRows ?? []) as unknown as Joined[]).filter((row) => row.lessons?.status !== 'archived');

  const { data: stateRows, error: statesError } = await client
    .from('card_states')
    .select(CARD_STATE_COLUMNS)
    .eq('user_id', userId);
  if (statesError) return dataErr(mapDataError(statesError));

  const stateByCard = new Map<number, CardSchedule>();
  for (const row of (stateRows ?? []) as StoredCardState[]) stateByCard.set(row.card_id, scheduleFrom(row));

  const cards = new Map<number, LearnCard>();
  const sessionCards: SessionCard[] = [];
  for (const row of joined) {
    // A card with no state row is a new card. Migration 60's trigger creates one at insert, so
    // this fallback should be unreachable — but treating its absence as "never reviewed" is both
    // the truth and the safe direction to be wrong in: it shows the card, it does not invent a
    // schedule.
    const schedule = stateByCard.get(row.id) ?? emptySchedule(row.id);
    const sessionCard: SessionCard = {
      cardId: row.id,
      lessonId: row.lesson_id,
      sourceId: row.lessons.source_id,
      schedule,
    };
    sessionCards.push(sessionCard);
    cards.set(row.id, { card: row, lesson: row.lessons, session: sessionCard });
  }

  const plan = buildSession(sessionCards, { newLimit: input.newLimit, now });

  const { data: lastSession, error: lastError } = await client
    .from('learn_sessions')
    .select('local_date')
    .eq('user_id', userId)
    .not('completed_at', 'is', null)
    .order('local_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastError) return dataErr(mapDataError(lastError));

  const dueNow = sessionCards.filter(
    (c) => c.schedule.dueAt !== null && Date.parse(c.schedule.dueAt) <= now.getTime(),
  ).length;

  return dataOk({
    plan,
    cards,
    // `dueAfterSession` is dueNow here because nothing has been reviewed yet in this render. The
    // comeback moment is fired by the SESSION-COMPLETE path, which recomputes with the real
    // after-count -- see `completeLearnSession`.
    comeback: comebackState({
      lastCompletedSessionDate: lastSession?.local_date ?? null,
      today: input.today,
      dueBeforeSession: dueNow,
      dueAfterSession: dueNow,
    }),
    strengths: sourceStrength(sessionCards, now),
    sourcesProcessing: (sources ?? []).filter((s) => s.status === 'processing').length,
    sourcesPartial: (sources ?? []).filter((s) => s.status === 'partial').length,
    totalSources: (sources ?? []).length,
  });
}

/**
 * Records one review: appends it to the log AND advances the card's stored state, in ONE
 * transaction, through `submit_learn_review`.
 *
 * The FSRS arithmetic happens here (packages/core, ts-fsrs) rather than in SQL — the brief forbids
 * hand-rolling the scheduler, and PL/pgSQL would be a second implementation. The RPC's job is to
 * REFUSE a transition that cannot be right: reps off by anything but one, a non-positive stability,
 * a due date in the past, a lapse count that moved without an 'again'. So the two halves cannot
 * disagree even if this function has a bug, which is exactly the property D47 is buying.
 *
 * `reviewedAt` is sent rather than left to the server's `now()`, and that is load-bearing: this is
 * the instant the schedule below was computed AT, and the oracle test recomputes the schedule from
 * the instant in the log. If the log recorded a different instant than the one that produced the
 * state, the two would differ by the clock skew between client and database and the oracle would be
 * measuring that instead of the scheduler.
 *
 * `answeredText` is kept because the generation effect depends on the attempt having existed, and
 * because it is what makes AI grading assist and any later analysis possible at all. It is the
 * user's own words about their own learning and is treated with the same care as journal content.
 */
export async function recordReview(
  client: TypedSupabaseClient,
  userId: string,
  input: {
    cardId: number;
    rating: LessonRating;
    localDate: LocalDate;
    desiredRetention: number;
    sessionId?: number;
    elapsedMs?: number;
    answeredText?: string;
    aiFeedback?: string;
  },
  now: Date = new Date(),
): Promise<DataResult<LessonReviewRow>> {
  const { data: stateRow, error: stateError } = await client
    .from('card_states')
    .select(CARD_STATE_COLUMNS)
    .eq('user_id', userId)
    .eq('card_id', input.cardId)
    .maybeSingle();
  if (stateError) return dataErr(mapDataError(stateError));
  if (!stateRow) {
    // The RPC would raise LR003 anyway; saying so here costs one round trip less and names the
    // real cause rather than a five-character code.
    return dataErr({ code: 'not_found', message: 'That card has no scheduling state to advance.' });
  }

  const previous = scheduleFrom(stateRow as StoredCardState);
  const reviewedAt = now.toISOString();

  let next: CardSchedule;
  try {
    next = nextSchedule(previous, { reviewedAt, rating: input.rating }, input.desiredRetention);
  } catch {
    // `nextSchedule` throws only when the review is not strictly after the previous one — a clock
    // that went backwards, or a queued offline review replayed out of order. Reported as a
    // validation failure rather than thrown, because every other path in this module returns.
    return dataErr({ code: 'validation', message: 'That review is out of order with this card\'s history.' });
  }

  const { data, error } = await client.rpc('submit_learn_review', {
    p_card_id: input.cardId,
    p_rating: input.rating,
    p_local_date: input.localDate,
    p_reviewed_at: reviewedAt,
    p_next_state: {
      state: next.state,
      due_at: next.dueAt,
      stability: next.stability,
      difficulty: next.difficulty,
      reps: next.reps,
      lapses: next.lapses,
      learning_steps: next.learningSteps,
    },
    ...(input.sessionId != null ? { p_session_id: input.sessionId } : {}),
    ...(input.elapsedMs != null ? { p_elapsed_ms: input.elapsedMs } : {}),
    ...(input.answeredText != null ? { p_answered_text: input.answeredText } : {}),
    ...(input.aiFeedback != null ? { p_ai_feedback: input.aiFeedback } : {}),
  });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data as LessonReviewRow);
}

export async function startLearnSession(
  client: TypedSupabaseClient,
  userId: string,
  localDate: LocalDate,
  now: Date = new Date(),
): Promise<DataResult<LearnSessionRow>> {
  const { data, error } = await client
    .from('learn_sessions')
    .insert({ user_id: userId, local_date: localDate, started_at: now.toISOString() })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export interface SessionCompletion {
  session: LearnSessionRow;
  comeback: ComebackState;
}

/**
 * Closes a session and computes the comeback state with the REAL after-count.
 *
 * This is where D29's amendment actually fires. The flag needs both halves — a genuine gap, and a
 * backlog that is now cleared — and only this path knows the second one, because it is the only
 * point at which the day's reviews have all been written. Firing it from the load path would
 * announce a comeback before the work that earned it.
 */
export async function completeLearnSession(
  client: TypedSupabaseClient,
  userId: string,
  input: {
    sessionId: number;
    today: LocalDate;
    cardsReviewed: number;
    newLessonsIntroduced: number;
    dueBeforeSession: number;
  },
  now: Date = new Date(),
): Promise<DataResult<SessionCompletion>> {
  const { data: previous, error: previousError } = await client
    .from('learn_sessions')
    .select('local_date')
    .eq('user_id', userId)
    .not('completed_at', 'is', null)
    .neq('id', input.sessionId)
    .order('local_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousError) return dataErr(mapDataError(previousError));

  const { data: session, error } = await client
    .from('learn_sessions')
    .update({
      completed_at: now.toISOString(),
      cards_reviewed: input.cardsReviewed,
      new_lessons_introduced: input.newLessonsIntroduced,
    })
    .eq('id', input.sessionId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));

  const remaining = await countDue(client, userId, now);
  if (!remaining.ok) return remaining;

  return dataOk({
    session,
    comeback: comebackState({
      lastCompletedSessionDate: previous?.local_date ?? null,
      today: input.today,
      dueBeforeSession: input.dueBeforeSession,
      dueAfterSession: remaining.data,
    }),
  });
}

/**
 * How many cards are due right now.
 *
 * One counting query against the `(user_id, due_at)` index, where this used to fetch and replay
 * every review the user had ever made. `desiredRetention` is no longer a parameter of the ANSWER —
 * the due date was computed with the user's retention at the moment of the review and is stored, so
 * changing the setting no longer silently rewrites history's due dates on the next render.
 *
 * `state <> 'new'` matches the partial index and states the rule: a card nobody has reviewed is not
 * due, it is unstarted, and counting it would turn the comeback queue into a to-do list.
 */
export async function countDue(
  client: TypedSupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<DataResult<number>> {
  const { count, error } = await client
    .from('card_states')
    .select('card_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .neq('state', 'new')
    .lte('due_at', now.toISOString());
  if (error) return dataErr(mapDataError(error));
  return dataOk(count ?? 0);
}

export interface SourceLibraryEntry {
  source: SourceRow;
  job: IngestJobRow | null;
  lessonCount: number;
  /** Mean retrievability across reviewed cards. Null when none have been reviewed. */
  strength: number | null;
}

/**
 * The library list.
 *
 * `strength` is null rather than 0 for a source whose cards have never been reviewed: an untouched
 * book has no retention to report, and a 0% bar beside it would read as failure at something never
 * attempted.
 */
export async function loadLibrary(
  client: TypedSupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<DataResult<SourceLibraryEntry[]>> {
  const { data: sources, error } = await client
    .from('sources')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) return dataErr(mapDataError(error));

  const { data: jobs, error: jobsError } = await client
    .from('ingest_jobs')
    .select('*')
    .eq('user_id', userId);
  if (jobsError) return dataErr(mapDataError(jobsError));

  const { data: cardRows, error: cardsError } = await client
    .from('lesson_cards')
    .select('id, lessons!inner(source_id, status)')
    .eq('user_id', userId)
    .eq('active', true)
    .is('suspended_at', null);
  if (cardsError) return dataErr(mapDataError(cardsError));

  const { data: stateRows, error: statesError } = await client
    .from('card_states')
    .select(CARD_STATE_COLUMNS)
    .eq('user_id', userId);
  if (statesError) return dataErr(mapDataError(statesError));

  const stateByCard = new Map<number, CardSchedule>();
  for (const row of (stateRows ?? []) as StoredCardState[]) stateByCard.set(row.card_id, scheduleFrom(row));

  const strengthBySource = new Map<number, { sum: number; count: number }>();
  type JoinedCard = { id: number; lessons: { source_id: number; status: LessonRow['status'] } };
  for (const row of (cardRows ?? []) as unknown as JoinedCard[]) {
    if (row.lessons.status === 'archived') continue;
    const schedule = stateByCard.get(row.id);
    if (!schedule) continue;
    const value = retrievability(schedule, now);
    // Null for a card never reviewed. Skipped rather than counted as zero: an untouched card has
    // no retention to average in, and folding a 0 in would drag a real strength down with it.
    if (value === null) continue;
    const entry = strengthBySource.get(row.lessons.source_id) ?? { sum: 0, count: 0 };
    entry.sum += value;
    entry.count += 1;
    strengthBySource.set(row.lessons.source_id, entry);
  }

  const jobBySource = new Map((jobs ?? []).map((job) => [job.source_id, job]));

  return dataOk(
    (sources ?? []).map((source) => {
      const entry = strengthBySource.get(source.id);
      return {
        source,
        job: jobBySource.get(source.id) ?? null,
        lessonCount: source.lesson_count,
        strength: entry && entry.count > 0 ? entry.sum / entry.count : null,
      };
    }),
  );
}

/** Every lesson for one source, for the library detail view. */
export async function listLessonsForSource(
  client: TypedSupabaseClient,
  userId: string,
  sourceId: number,
): Promise<DataResult<LessonRow[]>> {
  const { data, error } = await client
    .from('lessons')
    .select('*')
    .eq('user_id', userId)
    .eq('source_id', sourceId)
    // Provisional lessons are shown; archived ones are not. A source mid-ingestion has a real,
    // growing library rather than an empty one (ULM ADR-010), and a lesson that lost a dedup
    // contest is kept for referential integrity, not for display.
    .neq('status', 'archived')
    .order('id', { ascending: true });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

/**
 * Creates the source row and its ingestion job together.
 *
 * The job is what the pipeline drives; the source row alone would sit at `uploaded` forever with
 * nothing to advance it. Created in that order so a failure between them leaves a visible source
 * with no job -- which the library can show as "not started" -- rather than an orphan job pointing
 * at nothing.
 */
export async function createSource(
  client: TypedSupabaseClient,
  userId: string,
  input: { title: string; author?: string; kind?: SourceRow['kind']; storagePath: string },
): Promise<DataResult<SourceRow>> {
  const title = input.title.trim();
  if (title.length === 0) {
    return dataErr({ code: 'validation', message: 'A source needs a title.' });
  }

  const { data: source, error } = await client
    .from('sources')
    .insert({
      user_id: userId,
      title,
      storage_path: input.storagePath,
      status: 'uploaded',
      ...(input.author != null && input.author.trim().length > 0 ? { author: input.author.trim() } : {}),
      ...(input.kind != null ? { kind: input.kind } : {}),
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));

  const { error: jobError } = await client
    .from('ingest_jobs')
    .insert({ user_id: userId, source_id: source.id, step: 'queued' });
  if (jobError) return dataErr(mapDataError(jobError));

  return dataOk(source);
}
