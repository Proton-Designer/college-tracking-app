/**
 * Goal Ecology (D49) — the relationships between goals, and the optional gate on what becomes one.
 *
 * A list of goals cannot express the thing that actually kills systems: two goals quietly working
 * against each other. "Wake at 5am for deep work" and "network four nights a week" are each
 * reasonable and jointly impossible.
 *
 * Where this departs from the source module: it says to ELIMINATE competing goals. Sometimes two
 * goals genuinely compete and both matter, and the useful thing an app can do is make the tension
 * visible so the trade-off gets chosen rather than discovered in six weeks. So everything here
 * surfaces and nothing prescribes — there is no function that recommends dropping a goal.
 */

import type { LocalDate } from '../types';

export type GoalRelationship = 'competing' | 'neutral' | 'synergistic';

export interface GoalRef {
  id: number;
  title: string;
}

export interface RelationshipRecord {
  goalAId: number;
  goalBId: number;
  relationship: GoalRelationship;
  note: string | null;
}

/**
 * A pair as a surface needs it: both goals named, and the mark if there is one.
 *
 * `relationship` is `null` for an unmarked pair, and that is D49's ruling expressed in the type.
 * Unmarked is a question nobody has asked; `neutral` is an answer someone gave. Collapsing them
 * would inflate how examined a set of goals is — the same failure as reporting an unmeasured zero.
 */
export interface GoalPair {
  a: GoalRef;
  b: GoalRef;
  relationship: GoalRelationship | null;
  note: string | null;
}

/** Pair key, order-independent, matching the schema's `goal_a_id < goal_b_id`. */
function pairKey(x: number, y: number): string {
  return x < y ? `${x}:${y}` : `${y}:${x}`;
}

/**
 * Every unordered pair of the active goals, with any mark attached.
 *
 * Returns pairs rather than a per-goal summary because the relationship is a property OF THE PAIR —
 * "Business competes with Fitness" is not a fact about either one alone, and a per-goal view would
 * have to pick one of them to blame.
 */
export function buildPairs(goals: GoalRef[], marks: RelationshipRecord[]): GoalPair[] {
  const byKey = new Map<string, RelationshipRecord>();
  for (const mark of marks) byKey.set(pairKey(mark.goalAId, mark.goalBId), mark);

  const pairs: GoalPair[] = [];
  for (let i = 0; i < goals.length; i += 1) {
    for (let j = i + 1; j < goals.length; j += 1) {
      const a = goals[i]!;
      const b = goals[j]!;
      const mark = byKey.get(pairKey(a.id, b.id));
      pairs.push({
        a,
        b,
        relationship: mark ? mark.relationship : null,
        note: mark ? mark.note : null,
      });
    }
  }
  return pairs;
}

export interface EcologySummary {
  competing: GoalPair[];
  synergistic: GoalPair[];
  neutral: GoalPair[];
  /** Pairs nobody has marked. Reported, never counted as neutral. */
  unmarked: GoalPair[];
  totalPairs: number;
  /**
   * Share of pairs the user has actually considered. Null when there are fewer than two goals —
   * there is nothing to relate, which is different from having related nothing.
   */
  examinedShare: number | null;
}

export function summariseEcology(pairs: GoalPair[]): EcologySummary {
  const competing = pairs.filter((p) => p.relationship === 'competing');
  const synergistic = pairs.filter((p) => p.relationship === 'synergistic');
  const neutral = pairs.filter((p) => p.relationship === 'neutral');
  const unmarked = pairs.filter((p) => p.relationship === null);

  return {
    competing,
    synergistic,
    neutral,
    unmarked,
    totalPairs: pairs.length,
    examinedShare: pairs.length === 0 ? null : (pairs.length - unmarked.length) / pairs.length,
  };
}

// ---------------------------------------------------------------------------
// The Priority Matrix
// ---------------------------------------------------------------------------

export interface PriorityScores {
  visionAlignment: number;
  leverage: number;
  compoundBenefit: number;
  /** As the user scored it: HIGH means giving up a lot to do this. Inverted in the composite. */
  opportunityCost: number;
  scoredOn: LocalDate;
}

export const PRIORITY_MAX = 5;

/**
 * The composite, derived and never stored.
 *
 * Opportunity cost is inverted because it is the only one of the four where a high score is a
 * reason against: a goal costing a great deal to pursue should not rank above an equivalent one
 * that costs little. Storing the total would let it drift from the four numbers under it, and would
 * make the total the thing people optimise — the same reason Desired Self stores no points.
 *
 * Scale is 0–1 so a surface can render it without knowing the weighting, and every input is
 * clamped: a hand-edited 9 in the database must not produce a composite above the ceiling.
 */
export function priorityComposite(scores: PriorityScores): number {
  const clamp = (n: number): number => Math.min(PRIORITY_MAX, Math.max(1, n));
  const aligned = clamp(scores.visionAlignment);
  const leverage = clamp(scores.leverage);
  const compound = clamp(scores.compoundBenefit);
  // 5 becomes 1, 1 becomes 5.
  const costInverted = PRIORITY_MAX + 1 - clamp(scores.opportunityCost);

  const total = aligned + leverage + compound + costInverted;
  const min = 4;
  const max = 4 * PRIORITY_MAX;
  return (total - min) / (max - min);
}

export interface ScoredGoal {
  goal: GoalRef;
  scores: PriorityScores | null;
  /** Null when unscored. NOT zero — an unevaluated goal is not a bad one. */
  composite: number | null;
}

/**
 * Attaches composites, leaving unscored goals visibly unscored.
 *
 * Deliberately does not sort. Ranking goals by composite would turn an optional aid into the app's
 * opinion about someone's life; the matrix is a gate the user applies, not a verdict the app hands
 * back.
 */
export function scoreGoals(goals: GoalRef[], scores: Map<number, PriorityScores>): ScoredGoal[] {
  return goals.map((goal) => {
    const s = scores.get(goal.id) ?? null;
    return { goal, scores: s, composite: s === null ? null : priorityComposite(s) };
  });
}
