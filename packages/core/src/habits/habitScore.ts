import type { LocalDate } from '../types';
import { addDays, compareLocalDate, isoWeekday } from '../util/date';

/**
 * The decaying habit score -- BLUEPRINT 1B and IV-D.
 *
 * The research the blueprint cites is blunt about why this is not a streak: streaks drive
 * engagement but cause guilt-churn, and a counter that resets to zero is the mechanic that
 * makes people quit. So a miss DENTS the score and a check-in pulls it up, and the score
 * can never reach zero -- multiplying never gets there. That is the same reasoning D23 used
 * to reject the chain, applied one layer down.
 */

/**
 * A miss multiplies the score by this. Taken directly from the blueprint's stated model
 * (`score = score * 0.96` on a scheduled-but-missed day), not chosen here.
 */
const MISS_DECAY = 0.96;

/**
 * A check-in closes this fraction of the remaining distance to 100.
 *
 * The blueprint specifies the decay but not the boost, so this is a choice, and it is
 * expressed as a proportion rather than a flat "+N points" on purpose: a flat boost makes
 * the last few points as easy to win as the first, which would let a habit sit at 100 on
 * mediocre adherence. Closing a fraction of the gap means the top of the range has to be
 * earned by consistency, while recovery from a bad patch is fast -- which is the asymmetry
 * the no-guilt design wants.
 */
const HIT_GAIN = 0.1;

/**
 * Where a habit with no history sits: neither proven nor failed.
 *
 * Deliberately not 0. A new habit scored 0 reads as "you are failing at this" on the day
 * it is created, which is the guilt mechanic this whole model exists to avoid. Callers get
 * `observedDays` alongside the score so a UI can decline to show a number at all until
 * there is something to judge -- see the note on HabitScoreResult.
 */
const NEUTRAL_START = 50;

/** Floor for the reported score. See the note where it is applied. */
const MINIMUM_SCORE = 0.1;

export interface HabitLogEntry {
  localDate: LocalDate;
  done: boolean;
}

export interface HabitSchedule {
  /** ISO weekday numbers, 1 = Monday .. 7 = Sunday. */
  weekdays: number[];
}

export interface HabitScoreResult {
  /** 0-100, exclusive of 0 in practice. */
  score: number;
  /** All-time count of check-ins. The "votes for the athlete" number. */
  votes: number;
  /**
   * How many scheduled days were actually replayed. A UI should treat a small number as
   * "too new to judge" rather than rendering a confident score from two days of data.
   */
  observedDays: number;
}

export function isScheduledOn(schedule: HabitSchedule, date: LocalDate): boolean {
  return schedule.weekdays.includes(isoWeekday(date));
}

/**
 * Replays the log to produce the current score.
 *
 * Replayed rather than accumulated so the number is reproducible from the data at any
 * time, with no stored counter to drift and no nightly job whose failure would silently
 * freeze everyone at yesterday's value.
 *
 * `paused` freezes the score: a paused habit neither decays nor gains, which is the
 * blueprint's requirement that travel and sick days not break the system. It is applied to
 * the whole replay because pause history is not recorded -- if per-day pause history is
 * ever needed, it belongs in the log, not inferred here.
 */
export function computeHabitScore(
  logs: HabitLogEntry[],
  schedule: HabitSchedule,
  fromDate: LocalDate,
  toDate: LocalDate,
  paused = false,
): HabitScoreResult {
  const votes = logs.filter((l) => l.done).length;

  if (paused || schedule.weekdays.length === 0 || compareLocalDate(fromDate, toDate) > 0) {
    return { score: NEUTRAL_START, votes, observedDays: 0 };
  }

  const doneByDate = new Map<LocalDate, boolean>();
  for (const log of logs) doneByDate.set(log.localDate, log.done);

  let score = NEUTRAL_START;
  let observedDays = 0;

  for (let date = fromDate; compareLocalDate(date, toDate) <= 0; date = addDays(date, 1)) {
    if (!isScheduledOn(schedule, date)) continue;
    observedDays += 1;
    // An unanswered scheduled day counts as a miss. That is the one place this model is
    // deliberately harsher than toDayOutcomes' untracked handling: a habit you did not
    // record is a habit you did not do, and treating silence as neutral here would let a
    // score stay high through a month of not opening the app.
    const done = doneByDate.get(date) === true;
    score = done ? score + HIT_GAIN * (100 - score) : score * MISS_DECAY;
  }

  // The model itself can never reach zero -- repeated multiplication only approaches it --
  // but rounding to one decimal CAN, and did: 0.96^2400 is about 4e-43, which rounds to 0.0
  // and reads as "you have failed completely", the exact message this design exists to never
  // send. The floor keeps the observable value honest to the model.
  const rounded = Math.round(score * 10) / 10;
  return { score: Math.max(MINIMUM_SCORE, rounded), votes, observedDays };
}
