/**
 * FSRS scheduling for the Learn pillar.
 *
 * **The library does the algorithm; this file does the policy.** The brief is explicit that FSRS
 * must not be hand-rolled, so `ts-fsrs` (the maintained reference implementation) computes
 * stability, difficulty and intervals. What lives here is everything the library does not decide:
 * where state comes from, what a session contains, and what happens after a lapse.
 *
 * **State is derived by replaying the log, never stored.** This is migration 42's rule, restated
 * for a second scheduler: `lesson_reviews` is append-only and is the sole source of truth, so a
 * card's stability and due date are a pure function of its review history. Derived state cannot
 * drift from its log, needs no cron whose silent failure would freeze every due date, and is
 * testable as a function rather than an accumulated number nothing can check. It is also what makes
 * D32's eventual Question Bank migration lossless — there is no stored state on either side to
 * convert.
 *
 * `ts-fsrs` is the first runtime dependency `packages/core` has ever taken. That is deliberate and
 * narrow: the alternative is hand-rolling a scheduler the brief forbids hand-rolling. It is
 * dependency-free itself and is mapped for the Deno mirror in `supabase/functions/deno.json`,
 * alongside zod.
 */

import { Rating, State, createEmptyCard, fsrs, generatorParameters, type Card, type Grade } from 'ts-fsrs';
import type { LocalDate } from '../types';

export type LessonRating = 'again' | 'hard' | 'good' | 'easy';

/** Card lifecycle, mirroring FSRS's own states so a UI can show where a card is. */
export type CardState = 'new' | 'learning' | 'review' | 'relearning';

export const DEFAULT_DESIRED_RETENTION = 0.9;

export interface ReviewRecord {
  /** ISO instant. Reviews are replayed in this order. */
  reviewedAt: string;
  rating: LessonRating;
}

export interface CardSchedule {
  cardId: number;
  state: CardState;
  /** ISO instant the card next becomes due. Null for a card never reviewed. */
  dueAt: string | null;
  stability: number | null;
  difficulty: number | null;
  reps: number;
  lapses: number;
  lastReviewedAt: string | null;
}

const RATING_MAP: Record<LessonRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  good: Rating.Good,
  easy: Rating.Easy,
};

const STATE_MAP: Record<number, CardState> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

function scheduler(desiredRetention: number) {
  return fsrs(generatorParameters({ request_retention: desiredRetention, enable_fuzz: false }));
}

/**
 * Replays a card's review history into its current schedule.
 *
 * Fuzz is disabled deliberately. FSRS's fuzz spreads due dates randomly to avoid review pile-ups,
 * which is valuable in a 10,000-card Anki deck and actively harmful here: replaying a log must be
 * deterministic, or the same history would produce a different due date on every render and the
 * derive-don't-store design would quietly become unusable.
 *
 * An unparseable timestamp ends the replay rather than being skipped. Skipping it would compute a
 * schedule from a subset of the history and present it as the whole thing; stopping at least keeps
 * the result a truthful account of the reviews it could read.
 */
export function scheduleFromLog(
  cardId: number,
  reviews: ReviewRecord[],
  desiredRetention: number = DEFAULT_DESIRED_RETENTION,
): CardSchedule {
  const engine = scheduler(desiredRetention);
  const ordered = [...reviews].sort((a, b) => Date.parse(a.reviewedAt) - Date.parse(b.reviewedAt));

  let card: Card = createEmptyCard(
    ordered.length > 0 ? new Date(ordered[0]!.reviewedAt) : new Date(0),
  );
  let lastReviewedAt: string | null = null;

  for (const review of ordered) {
    const at = new Date(review.reviewedAt);
    if (Number.isNaN(at.getTime())) break;
    card = engine.next(card, at, RATING_MAP[review.rating]).card;
    lastReviewedAt = review.reviewedAt;
  }

  const neverReviewed = lastReviewedAt === null;
  return {
    cardId,
    state: neverReviewed ? 'new' : (STATE_MAP[card.state] ?? 'review'),
    dueAt: neverReviewed ? null : card.due.toISOString(),
    stability: neverReviewed ? null : card.stability,
    difficulty: neverReviewed ? null : card.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    lastReviewedAt,
  };
}

/**
 * Retrievability: the probability the card would be recalled right now, from FSRS's forgetting
 * curve. This is what the memory-strength visualisation shows — the user watching themselves beat
 * the curve, which the brief calls the product's WHOOP-style score.
 *
 * Null for a card never reviewed. A new card has no memory strength to report, and rendering 0%
 * would say "you have forgotten this" about something never learned (D40).
 */
export function retrievability(schedule: CardSchedule, now: Date): number | null {
  if (schedule.stability === null || schedule.lastReviewedAt === null) return null;
  const elapsedDays = Math.max(0, (now.getTime() - Date.parse(schedule.lastReviewedAt)) / 86_400_000);
  // FSRS-5's power forgetting curve.
  const decay = -0.5;
  const factor = 0.9 ** (1 / decay) - 1;
  return (1 + (factor * elapsedDays) / schedule.stability) ** decay;
}

export function isDue(schedule: CardSchedule, now: Date): boolean {
  if (schedule.dueAt === null) return false;
  return Date.parse(schedule.dueAt) <= now.getTime();
}

// ---------------------------------------------------------------------------
// The daily session
// ---------------------------------------------------------------------------

export interface SessionCard {
  cardId: number;
  lessonId: number;
  sourceId: number;
  schedule: CardSchedule;
}

export interface SessionPlan {
  /** One easy due card first, for momentum. Absent when nothing is due. */
  warmUp: SessionCard | null;
  /** Due reviews, interleaved across sources rather than blocked by source. */
  due: SessionCard[];
  /** New lessons, introduced only after due reviews are cleared. */
  introductions: SessionCard[];
  /** Total cards the session will present. */
  totalCards: number;
}

/**
 * Builds the day's session.
 *
 * Three rules from the research, each of which changes what the queue looks like:
 *
 * - **Interleaving across sources, not blocking by source.** Mixing near-neighbour concepts is what
 *   makes retrieval discriminative rather than pattern-matched; a queue sorted by source would let
 *   the reader coast on context.
 * - **New lessons only after due reviews are cleared.** Introducing new material while a backlog
 *   exists trades long-term retention for the feeling of progress, which is exactly the failure the
 *   product is built against.
 * - **The warm-up is the most-retrievable due card**, not a random one. Momentum comes from a
 *   success, and the easiest available success is the cheapest way to buy it.
 */
export function buildSession(
  cards: SessionCard[],
  options: { newLimit: number; now: Date; maxCards?: number },
): SessionPlan {
  const { newLimit, now, maxCards = 60 } = options;

  const due = cards.filter((c) => isDue(c.schedule, now));
  const fresh = cards.filter((c) => c.schedule.state === 'new');

  // Interleave by round-robin across sources. Sorting by due date alone reliably groups a source
  // together, because a source's cards are introduced together and therefore ripen together.
  const bySource = new Map<number, SessionCard[]>();
  for (const card of due) {
    const bucket = bySource.get(card.sourceId);
    if (bucket) bucket.push(card);
    else bySource.set(card.sourceId, [card]);
  }
  for (const bucket of bySource.values()) {
    bucket.sort((a, b) => Date.parse(a.schedule.dueAt!) - Date.parse(b.schedule.dueAt!));
  }

  const interleaved: SessionCard[] = [];
  const buckets = [...bySource.values()];
  for (let round = 0; interleaved.length < due.length; round += 1) {
    let placed = false;
    for (const bucket of buckets) {
      const card = bucket[round];
      if (card) {
        interleaved.push(card);
        placed = true;
      }
    }
    if (!placed) break;
  }

  // The warm-up is the due card most likely to be recalled -- an easy win, deliberately.
  let warmUp: SessionCard | null = null;
  if (interleaved.length > 0) {
    let best = interleaved[0]!;
    let bestScore = retrievability(best.schedule, now) ?? 0;
    for (const card of interleaved) {
      const score = retrievability(card.schedule, now) ?? 0;
      if (score > bestScore) {
        best = card;
        bestScore = score;
      }
    }
    warmUp = best;
  }

  const remainingDue = interleaved.filter((c) => c.cardId !== warmUp?.cardId).slice(0, maxCards);

  // New lessons wait for a clear queue. `newLimit` is a per-user setting, not a constant (D39).
  const backlogCleared = due.length === 0;
  const introductions = backlogCleared ? fresh.slice(0, Math.max(0, newLimit)) : [];

  return {
    warmUp,
    due: remainingDue,
    introductions,
    totalCards: (warmUp ? 1 : 0) + remainingDue.length + introductions.length,
  };
}

// ---------------------------------------------------------------------------
// D29 -- the comeback, as a visible moment
// ---------------------------------------------------------------------------

export interface ComebackState {
  /** Days since the last completed session. Null when there has never been one. */
  daysAway: number | null;
  /** Cards that came due while away. */
  waiting: number;
  /**
   * True when a lapse has just been cleared -- the moment the app must actually mark.
   *
   * D29 as amended by the owner: a due queue is not a debt the user incurred, it is what FSRS
   * ripened, so the comeback has to be a moment a person sees rather than a property of the
   * schema. This flag is what a surface fires the acknowledgement on. Without it the comeback
   * framing exists only in the architecture and never reaches anyone, which is indistinguishable
   * from not having built it.
   */
  justRecovered: boolean;
}

/** A gap this long or longer is a lapse worth acknowledging on return. */
export const LAPSE_DAYS = 2;

export function comebackState(input: {
  lastCompletedSessionDate: LocalDate | null;
  today: LocalDate;
  dueBeforeSession: number;
  dueAfterSession: number;
}): ComebackState {
  const { lastCompletedSessionDate, today, dueBeforeSession, dueAfterSession } = input;

  if (lastCompletedSessionDate === null) {
    return { daysAway: null, waiting: dueBeforeSession, justRecovered: false };
  }

  const daysAway = Math.max(
    0,
    Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastCompletedSessionDate}T00:00:00Z`)) / 86_400_000),
  );

  return {
    daysAway,
    waiting: dueBeforeSession,
    // Cleared the backlog after having been away. Both halves are required: clearing a queue you
    // never let build is an ordinary good day, not a comeback, and saying otherwise would cheapen
    // the moment that matters.
    justRecovered: daysAway >= LAPSE_DAYS && dueBeforeSession > 0 && dueAfterSession === 0,
  };
}

export interface SourceStrength {
  sourceId: number;
  /** Mean retrievability across the source's reviewed cards. Null when none have been reviewed. */
  strength: number | null;
  reviewedCards: number;
  totalCards: number;
}

/**
 * Memory strength per source, for the visualisation the brief calls the MVP's score.
 *
 * Null rather than 0 for a source whose cards have never been reviewed: an untouched book has no
 * retention to report, and a 0% bar next to it would read as failure at something never attempted.
 */
export function sourceStrength(cards: SessionCard[], now: Date): SourceStrength[] {
  const bySource = new Map<number, { sum: number; reviewed: number; total: number }>();

  for (const card of cards) {
    const entry = bySource.get(card.sourceId) ?? { sum: 0, reviewed: 0, total: 0 };
    entry.total += 1;
    const r = retrievability(card.schedule, now);
    if (r !== null) {
      entry.sum += r;
      entry.reviewed += 1;
    }
    bySource.set(card.sourceId, entry);
  }

  return [...bySource.entries()].map(([sourceId, entry]) => ({
    sourceId,
    strength: entry.reviewed === 0 ? null : entry.sum / entry.reviewed,
    reviewedCards: entry.reviewed,
    totalCards: entry.total,
  }));
}
