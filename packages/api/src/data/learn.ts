import {
  buildSession,
  comebackState,
  retrievability,
  scheduleFromLog,
  sourceStrength,
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

/**
 * The Learn pillar's data layer.
 *
 * The defining property, and the reason this module looks the way it does: **there is no scheduler
 * state in the database.** A card's stability, difficulty and due date are computed by replaying
 * `lesson_reviews`, which is append-only. So every read here fetches a log and hands it to
 * `packages/core`, and every write appends. Nothing updates a schedule, because no schedule is
 * stored to update.
 *
 * That is migration 42's rule applied to a second scheduler, and it is what makes D32's eventual
 * Question Bank migration lossless — there is no stored state on either side to convert.
 */

/** How much review history to replay. Older reviews no longer move an FSRS schedule measurably. */
const REVIEW_HISTORY_LIMIT = 2000;

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
  /** Sources with no ready lessons yet, so the UI can say why a session is empty. */
  sourcesProcessing: number;
  totalSources: number;
}

/**
 * Assembles today's session.
 *
 * One query for the cards, one for their review history, then everything else is computed. The
 * history is fetched in a single pass rather than per card: a per-card query is the quiet
 * quadratic that only shows up once someone has a few hundred cards, which is exactly when the
 * session is supposed to feel fast.
 */
export async function loadDailySession(
  client: TypedSupabaseClient,
  userId: string,
  input: { today: LocalDate; newLimit: number; desiredRetention: number },
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
      'id, lesson_id, prompt_type, prompt, answer, sort_order, active, created_at, updated_at, user_id, lessons!inner(id, title, core_claim, claim_to_task, provenance_quote, page_ref, source_id, active)',
    )
    .eq('user_id', userId)
    .eq('active', true);
  if (cardsError) return dataErr(mapDataError(cardsError));

  type Joined = LessonCardRow & { lessons: LearnCard['lesson'] & { active: boolean } };
  const joined = ((cardRows ?? []) as unknown as Joined[]).filter((row) => row.lessons?.active);

  const { data: reviewRows, error: reviewsError } = await client
    .from('lesson_reviews')
    .select('card_id, rating, reviewed_at')
    .eq('user_id', userId)
    .order('reviewed_at', { ascending: true })
    .limit(REVIEW_HISTORY_LIMIT);
  if (reviewsError) return dataErr(mapDataError(reviewsError));

  const historyByCard = new Map<number, { reviewedAt: string; rating: LessonRating }[]>();
  for (const review of reviewRows ?? []) {
    const bucket = historyByCard.get(review.card_id) ?? [];
    bucket.push({ reviewedAt: review.reviewed_at, rating: review.rating as LessonRating });
    historyByCard.set(review.card_id, bucket);
  }

  const cards = new Map<number, LearnCard>();
  const sessionCards: SessionCard[] = [];
  for (const row of joined) {
    const schedule = scheduleFromLog(row.id, historyByCard.get(row.id) ?? [], input.desiredRetention);
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
    totalSources: (sources ?? []).length,
  });
}

/**
 * Appends one review. This is the only write that changes a card's schedule, and it changes it by
 * adding to the log rather than by updating anything.
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
    sessionId?: number;
    elapsedMs?: number;
    answeredText?: string;
    aiFeedback?: string;
  },
  now: Date = new Date(),
): Promise<DataResult<LessonReviewRow>> {
  const { data, error } = await client
    .from('lesson_reviews')
    .insert({
      user_id: userId,
      card_id: input.cardId,
      rating: input.rating,
      local_date: input.localDate,
      reviewed_at: now.toISOString(),
      ...(input.sessionId != null ? { session_id: input.sessionId } : {}),
      ...(input.elapsedMs != null ? { elapsed_ms: input.elapsedMs } : {}),
      ...(input.answeredText != null ? { answered_text: input.answeredText } : {}),
      ...(input.aiFeedback != null ? { ai_feedback: input.aiFeedback } : {}),
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
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
    desiredRetention: number;
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

  const remaining = await countDue(client, userId, input.desiredRetention, now);
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

/** How many cards are due right now, replayed from the log. */
export async function countDue(
  client: TypedSupabaseClient,
  userId: string,
  desiredRetention: number,
  now: Date = new Date(),
): Promise<DataResult<number>> {
  const { data, error } = await client
    .from('lesson_reviews')
    .select('card_id, rating, reviewed_at')
    .eq('user_id', userId)
    .order('reviewed_at', { ascending: true })
    .limit(REVIEW_HISTORY_LIMIT);
  if (error) return dataErr(mapDataError(error));

  const byCard = new Map<number, { reviewedAt: string; rating: LessonRating }[]>();
  for (const review of data ?? []) {
    const bucket = byCard.get(review.card_id) ?? [];
    bucket.push({ reviewedAt: review.reviewed_at, rating: review.rating as LessonRating });
    byCard.set(review.card_id, bucket);
  }

  let due = 0;
  for (const [cardId, history] of byCard) {
    const schedule = scheduleFromLog(cardId, history, desiredRetention);
    if (schedule.dueAt !== null && Date.parse(schedule.dueAt) <= now.getTime()) due += 1;
  }
  return dataOk(due);
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
  desiredRetention: number,
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
    .select('id, lessons!inner(source_id)')
    .eq('user_id', userId)
    .eq('active', true);
  if (cardsError) return dataErr(mapDataError(cardsError));

  const { data: reviewRows, error: reviewsError } = await client
    .from('lesson_reviews')
    .select('card_id, rating, reviewed_at')
    .eq('user_id', userId)
    .order('reviewed_at', { ascending: true })
    .limit(REVIEW_HISTORY_LIMIT);
  if (reviewsError) return dataErr(mapDataError(reviewsError));

  const historyByCard = new Map<number, { reviewedAt: string; rating: LessonRating }[]>();
  for (const review of reviewRows ?? []) {
    const bucket = historyByCard.get(review.card_id) ?? [];
    bucket.push({ reviewedAt: review.reviewed_at, rating: review.rating as LessonRating });
    historyByCard.set(review.card_id, bucket);
  }

  const strengthBySource = new Map<number, { sum: number; count: number }>();
  type JoinedCard = { id: number; lessons: { source_id: number } };
  for (const row of (cardRows ?? []) as unknown as JoinedCard[]) {
    const history = historyByCard.get(row.id);
    if (!history || history.length === 0) continue;
    const value = retrievability(scheduleFromLog(row.id, history, desiredRetention), now);
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
    .eq('active', true)
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
