/**
 * The vision chain — resolving an item upward, counting what traces to nothing, and the
 * 90-day clock (D48).
 *
 * ```
 * 10-Year Vision  ->  3-Year Beachhead  ->  1-Year Mission  ->  90-Day M.O.M.
 *                       ->  goals / milestones (exist)  ->  Night Plan MIT (exists)
 * ```
 *
 * **Every link is optional, and that is the ruling rather than an omission.** Forcing an MIT to
 * justify itself upward would make the Night Plan unusable on the ordinary night when something
 * urgent is the honest answer, and would train people to attach a lie. So nothing here treats a
 * missing link as invalid input: `resolveChain` returns the links an item *has* and names the
 * first one it does not, and both halves of that answer are equally legitimate.
 *
 * **Drift is a fact, not a verdict.** `unanchoredOverWindow` returns a count and the items behind
 * it, so a surface can name them. There is no score, no ratio dressed as a grade, no band and no
 * threshold past which something is "bad" — deliberately, because sometimes the honest reading is
 * that the chain is wrong rather than the night. `driftLine` is the one piece of copy this module
 * owns, kept here so web and mobile cannot word it differently, and it is a sentence of arithmetic
 * with no adjective in it.
 *
 * **Nothing is fabricated (D40).** A M.O.M. with no end date has `daysRemaining: null`, never 0,
 * and is never "due" — a countdown against a date nobody set would be an invented deadline. An
 * empty window returns `considered: 0` and `driftLine` returns null, because there is no honest
 * sentence to write about nights that have not happened.
 */

import type { LocalDate } from '../types';
import { compareLocalDate, daysBetween } from '../util/date';

/** The four layers above the War Map, ordered bottom-up — the direction the resolver walks. */
export const CHAIN_LAYERS_UPWARD = ['mom', 'mission', 'beachhead', 'vision'] as const;

export type ChainLayer = (typeof CHAIN_LAYERS_UPWARD)[number];

export const CHAIN_LAYER_LABELS: Readonly<Record<ChainLayer, string>> = {
  mom: '90-day M.O.M.',
  mission: '1-year Mission',
  beachhead: '3-year Beachhead',
  vision: '10-year Vision',
};

export interface VisionNode {
  id: number;
  /** The first line of the written statement. The whole body is not this module's business. */
  headline: string;
}

export interface BeachheadNode {
  id: number;
  title: string;
  visionId: number | null;
}

export interface MissionNode {
  id: number;
  title: string;
  beachheadId: number | null;
}

export interface MomNode {
  id: number;
  title: string;
  missionId: number | null;
  startsOn: LocalDate | null;
  /** Nullable, and stays nullable: a M.O.M. with no end date shows no countdown (D40). */
  endsOn: LocalDate | null;
}

/** Every chain node the resolver may need, already loaded. Pure in, pure out — no I/O here. */
export interface ChainSource {
  vision: VisionNode | null;
  beachheads: BeachheadNode[];
  missions: MissionNode[];
  moms: MomNode[];
}

/**
 * An item hanging (or not hanging) below the chain — an MIT, a task, a goal.
 *
 * Two anchors because there are two honest routes up. `momId` is the item naming a M.O.M. itself,
 * which is what the Night Plan's optional picker writes. `goalMomId` is the M.O.M. its War Map
 * goal answers to. Direct wins when both exist: the user said this one out loud about this item.
 */
export interface ChainAnchor {
  momId: number | null;
  goalMomId?: number | null;
}

export type ChainRoute = 'direct' | 'goal';

export interface ResolvedChain {
  mom: MomNode | null;
  mission: MissionNode | null;
  beachhead: BeachheadNode | null;
  vision: VisionNode | null;
  /** How the item reached the chain, or null when it reached nothing. */
  via: ChainRoute | null;
  /** The layers it does have, bottom-up. Contiguous from `mom` by construction. */
  present: ChainLayer[];
  /**
   * The first layer the line breaks at, walking up — `'mom'` for an item anchored to nothing,
   * `null` when the line is unbroken all the way to the vision. This is what a surface points at
   * when it offers the next thing to write; it is not a complaint.
   */
  firstMissing: ChainLayer | null;
  /** Whether the item reaches a M.O.M. at all. The opposite of `unanchored`. */
  anchored: boolean;
}

/**
 * Walks one item up the chain, stopping at the first missing link.
 *
 * Stops rather than skips: a mission whose `beachheadId` is null does not get to borrow the
 * user's only beachhead. The line is either continuous or it is broken, and pretending otherwise
 * would report a chain the user never drew.
 *
 * A dangling id — an anchor pointing at a row that is not in `source` — resolves the same way as
 * no anchor at all. That is the honest reading: `on delete set null` means a retired parent leaves
 * children unanchored, and a partial `source` (one filtered to active rows, say) must not be able
 * to invent a link either.
 */
export function resolveChain(source: ChainSource, anchor: ChainAnchor): ResolvedChain {
  const direct = anchor.momId == null ? null : (source.moms.find((m) => m.id === anchor.momId) ?? null);
  const viaGoal =
    anchor.goalMomId == null ? null : (source.moms.find((m) => m.id === anchor.goalMomId) ?? null);

  const mom = direct ?? viaGoal;
  const via: ChainRoute | null = direct != null ? 'direct' : viaGoal != null ? 'goal' : null;

  const mission =
    mom?.missionId == null ? null : (source.missions.find((m) => m.id === mom.missionId) ?? null);
  const beachhead =
    mission?.beachheadId == null
      ? null
      : (source.beachheads.find((b) => b.id === mission.beachheadId) ?? null);
  // The vision is a single active statement, so the link is checked by id rather than looked up in
  // a list: a beachhead pointing at a superseded vision is not attached to the current one.
  const vision =
    beachhead?.visionId == null || source.vision == null || source.vision.id !== beachhead.visionId
      ? null
      : source.vision;

  const found: Record<ChainLayer, boolean> = {
    mom: mom != null,
    mission: mission != null,
    beachhead: beachhead != null,
    vision: vision != null,
  };

  const present: ChainLayer[] = [];
  let firstMissing: ChainLayer | null = null;
  for (const layer of CHAIN_LAYERS_UPWARD) {
    if (!found[layer]) {
      firstMissing = layer;
      break;
    }
    present.push(layer);
  }

  return { mom, mission, beachhead, vision, via, present, firstMissing, anchored: mom != null };
}

/** One item considered by a drift report, with enough to name itself on screen. */
export interface WindowItem {
  id: number;
  title: string;
  date: LocalDate;
  momId: number | null;
  goalMomId?: number | null;
}

export interface UnanchoredReport {
  from: LocalDate;
  to: LocalDate;
  /** How many items fell in the window at all. Zero means there is nothing to say, not zero drift. */
  considered: number;
  unanchored: number;
  /** The unanchored items themselves, most recent first — the count is never shown without them. */
  items: { id: number; title: string; date: LocalDate }[];
}

/**
 * How many of these items trace to nothing above them.
 *
 * A plain count over whatever it is handed, so a caller can ask it about the last ten MITs, this
 * week's tasks, or the War Map's goals without this module needing to know which.
 */
export function unanchoredCount(items: WindowItem[], source: ChainSource): number {
  return items.filter((item) => !resolveChain(source, item).anchored).length;
}

/**
 * The drift report over a date window: what was considered, what was unanchored, and which items.
 *
 * The items travel with the count on purpose — the same reasoning `DimensionStanding` follows for
 * evidence. A bare number is a verdict; a number you can open and read the titles of is a fact.
 */
export function unanchoredOverWindow(
  items: WindowItem[],
  source: ChainSource,
  from: LocalDate,
  to: LocalDate,
): UnanchoredReport {
  const inWindow = items.filter(
    (item) => compareLocalDate(item.date, from) >= 0 && compareLocalDate(item.date, to) <= 0,
  );
  const unanchored = inWindow
    .filter((item) => !resolveChain(source, item).anchored)
    .sort((a, b) => compareLocalDate(b.date, a.date));

  return {
    from,
    to,
    considered: inWindow.length,
    unanchored: unanchored.length,
    items: unanchored.map((item) => ({ id: item.id, title: item.title, date: item.date })),
  };
}

/**
 * The one sentence both platforms show for drift. Arithmetic, and nothing else.
 *
 * No adjective, no verdict, no second clause suggesting what to do about it. "3 of your last 10
 * MITs weren't connected to anything above them" is a fact someone can act on or disagree with;
 * "you're drifting" is the app deciding it knows which. Returns null when the window is empty,
 * because a sentence about nights that have not happened would be a fabricated observation (D40).
 */
export function driftLine(report: UnanchoredReport, noun = 'MITs'): string | null {
  if (report.considered === 0) return null;
  if (report.unanchored === 0) {
    return `All ${report.considered} of your last ${report.considered} ${noun} connected to something above them.`;
  }
  return `${report.unanchored} of your last ${report.considered} ${noun} weren't connected to anything above them.`;
}

export interface MomCountdown {
  momId: number;
  /**
   * Days from today to the end date, inclusive-of-today's-remainder — 0 on the last day, negative
   * once it has passed. **Null when the M.O.M. has no end date**: no countdown rather than a zero.
   */
  daysRemaining: number | null;
  /** Days from the start date to today, or null when no start date was set. */
  elapsedDays: number | null;
  /** The window's own length in days, or null when either end is unset. */
  totalDays: number | null;
}

/**
 * The 90-day clock for one M.O.M.
 *
 * Nothing is assumed to be 90 days long. The name is the ritual's, not the arithmetic's: the
 * window comes from the dates the user actually set, and a M.O.M. they gave no end date is simply
 * a M.O.M. with no countdown. Defaulting it to "start + 90" would be inventing a deadline and
 * then holding someone to it.
 */
export function momCountdown(mom: MomNode, today: LocalDate): MomCountdown {
  const daysRemaining = mom.endsOn == null ? null : daysBetween(today, mom.endsOn);
  const elapsedDays = mom.startsOn == null ? null : daysBetween(mom.startsOn, today);
  const totalDays =
    mom.startsOn == null || mom.endsOn == null ? null : daysBetween(mom.startsOn, mom.endsOn);

  return { momId: mom.id, daysRemaining, elapsedDays, totalDays };
}

/**
 * Whether the 90-day review is due.
 *
 * Due means three things at once: the M.O.M. has an end date, today is on or past it, and no
 * review has been written for it. A M.O.M. with no end date is never due — the app has no basis
 * for the claim, and an unpromptable ritual is better than a prompt for a deadline nobody set.
 * Already reviewed is never due again, because the review is the closing ritual and not a nag.
 */
export function isMomReviewDue(
  mom: MomNode | null,
  today: LocalDate,
  alreadyReviewed: boolean,
): boolean {
  if (mom == null || alreadyReviewed) return false;
  if (mom.endsOn == null) return false;
  return compareLocalDate(today, mom.endsOn) >= 0;
}
