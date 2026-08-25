import type { LocalDate } from '../types';
import { addDays, compareLocalDate } from '../util/date';

/**
 * SM-2-lite -- BLUEPRINT 5.4's "no proprietary black box; you can read the algorithm in
 * one screen of code". This file is that screen.
 *
 * State is REPLAYED from the attempts log, never stored (migration 42's header carries
 * the full argument -- the habit-score precedent). Correct answers climb a fixed ladder
 * (1 -> 3 -> 7 -> 21 days), then multiply by ease. A miss resets the interval short,
 * counts a lapse, and dents ease. One deliberate addition to classic SM-2: a correct
 * answer tapped as "guessing" HOLDS the current step instead of advancing -- a lucky
 * guess is not knowledge, and letting it stretch the interval would be the
 * illusion-of-competence bug built directly into the scheduler.
 */

/** NOT core's risk `Confidence` (high/moderate/low/insufficient) -- same word, different
 *  instrument, prefixed so the barrel can never conflate them. */
export type RetrievalConfidence = 'sure' | 'thinkso' | 'guessing';

export interface AttemptEntry {
  localDate: LocalDate;
  correct: boolean;
  confidence: RetrievalConfidence;
}

export interface SchedulerState {
  intervalDays: number;
  ease: number;
  lapses: number;
  /** The next day this question is due, in the user's local calendar. */
  dueDate: LocalDate;
  lastAttemptDate: LocalDate | null;
}

const LADDER = [1, 3, 7, 21] as const;
const EASE_START = 2.5;
const EASE_MIN = 1.3;
const EASE_MAX = 3.0;
const EASE_MISS_PENALTY = 0.2;
const EASE_SURE_BONUS = 0.05;

/** Next interval after a correct answer at the current interval. */
function grow(intervalDays: number, ease: number): number {
  for (const step of LADDER) {
    if (intervalDays < step) return step;
  }
  return Math.round(intervalDays * ease);
}

export function computeSchedulerState(attempts: AttemptEntry[], createdDate: LocalDate): SchedulerState {
  const ordered = [...attempts].sort((a, b) => compareLocalDate(a.localDate, b.localDate));

  let intervalDays = 0;
  let ease = EASE_START;
  let lapses = 0;
  let lastAttemptDate: LocalDate | null = null;

  for (const attempt of ordered) {
    lastAttemptDate = attempt.localDate;
    if (!attempt.correct) {
      lapses += 1;
      intervalDays = 1;
      ease = Math.max(EASE_MIN, ease - EASE_MISS_PENALTY);
    } else if (attempt.confidence === 'guessing') {
      // Hold: due again after the SAME interval. A first-ever lucky guess still earns
      // the first ladder step -- there is no smaller interval to hold at.
      intervalDays = Math.max(intervalDays, LADDER[0]);
    } else {
      intervalDays = grow(intervalDays, ease);
      if (attempt.confidence === 'sure') ease = Math.min(EASE_MAX, ease + EASE_SURE_BONUS);
    }
  }

  // A never-attempted question is due on its creation day: new cards enter the queue
  // immediately rather than waiting for a scheduler to notice them.
  const dueDate = lastAttemptDate === null ? createdDate : addDays(lastAttemptDate, intervalDays);

  return { intervalDays, ease: Math.round(ease * 100) / 100, lapses, dueDate, lastAttemptDate };
}
