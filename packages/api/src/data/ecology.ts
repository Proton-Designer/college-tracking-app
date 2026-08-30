import {
  buildPairs,
  scoreGoals,
  summariseEcology,
  PRIORITY_MAX,
  type EcologySummary,
  type GoalPair,
  type GoalRef,
  type GoalRelationship,
  type LocalDate,
  type PriorityScores,
  type RelationshipRecord,
  type ScoredGoal,
} from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';
import type { GoalRow } from './goals';

/**
 * Goal Ecology's data layer (D49). Fetch-and-write only, in the shape `deen.ts` and `vision.ts`
 * already established: **nothing in this file decides what a pair means or what a goal is worth.**
 * The pair enumeration, the examined share and the priority composite are all
 * `packages/core/src/goals/ecology.ts`, called from `loadGoalEcology` below and never re-derived
 * here or in a UI (Law 2).
 *
 * Two properties of the schema shape every write in here, and both are D49 expressed in DDL:
 *
 * 1. **An unmarked pair has NO ROW.** There is no `relationship = 'unmarked'` and there must never
 *    be a default. `buildPairs` supplies the pair with `relationship: null`, and `clearPairMark`
 *    below is the only way back to that state — un-answering a question is a real gesture, and
 *    without it the first tap would be irreversible and "examined" would only ever ratchet up.
 *
 * 2. **The Priority Matrix stores four numbers and no total.** The composite is derived by
 *    `priorityComposite` at read time so it can never disagree with the scores beneath it, and an
 *    unscored goal comes back with `composite: null` — not `0`. An unevaluated goal is not a bad
 *    one.
 *
 * What this module deliberately does NOT have: any function that ranks goals, recommends dropping
 * one, or reads a competing pair as a problem to resolve. The engine surfaces the tension; the
 * trade-off stays the user's.
 */

export type GoalRelationshipRow = Database['public']['Tables']['goal_relationships']['Row'];
export type GoalPriorityScoreRow = Database['public']['Tables']['goal_priority_scores']['Row'];

/** The three answers a user can give about a pair. Absence of a row is the fourth state, and it is
 *  not in this list on purpose — see the module header. */
export const GOAL_RELATIONSHIPS: readonly GoalRelationship[] = ['competing', 'neutral', 'synergistic'];

/**
 * The pair as the schema stores it: `goal_a_id < goal_b_id`, enforced by
 * `goal_relationships_ordered`. Ordering here rather than at each call site is what makes the
 * unique constraint mean "one row per pair" — (A,B) and (B,A) written from two different surfaces
 * would otherwise be two rows that can disagree about the same relationship.
 */
function orderPair(x: number, y: number): { a: number; b: number } {
  return x < y ? { a: x, b: y } : { a: y, b: x };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Every relationship this user has marked. Rows only — the unmarked pairs are the ones absent
 * from this list, and `buildPairs` is what turns that absence into a visible, nameable state.
 */
export async function listGoalRelationships(
  client: TypedSupabaseClient,
  userId: string,
): Promise<DataResult<GoalRelationshipRow[]>> {
  const { data, error } = await client
    .from('goal_relationships')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

/** Every Priority Matrix row this user has written. A goal missing from here is unscored. */
export async function listGoalPriorityScores(
  client: TypedSupabaseClient,
  userId: string,
): Promise<DataResult<GoalPriorityScoreRow[]>> {
  const { data, error } = await client.from('goal_priority_scores').select('*').eq('user_id', userId);
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

// ---------------------------------------------------------------------------
// Writes -- the pair mark
// ---------------------------------------------------------------------------

export interface MarkGoalPairInput {
  goalAId: number;
  goalBId: number;
  relationship: GoalRelationship;
  /** The user's own sentence about why. This is the part they reread in ninety days, and it is
   *  what makes a competing pair actionable rather than merely flagged. Optional; blank clears. */
  note?: string | null;
}

/**
 * Marks (or re-marks) one pair.
 *
 * Upsert on `goal_relationships_one_per_pair` so changing your mind edits the pair rather than
 * appending a second opinion about the same two goals — the same reasoning `setPrayerStatus` uses,
 * and what makes the gesture safe to repeat on a flaky connection.
 */
export async function markGoalPair(
  client: TypedSupabaseClient,
  userId: string,
  input: MarkGoalPairInput,
): Promise<DataResult<GoalRelationshipRow>> {
  if (input.goalAId === input.goalBId) {
    return dataErr({ code: 'validation', message: 'A goal cannot be related to itself.' });
  }
  if (!GOAL_RELATIONSHIPS.includes(input.relationship)) {
    return dataErr({ code: 'validation', message: 'Unknown relationship.' });
  }

  const { a, b } = orderPair(input.goalAId, input.goalBId);
  const note = input.note?.trim() ?? '';

  const { data, error } = await client
    .from('goal_relationships')
    .upsert(
      {
        user_id: userId,
        goal_a_id: a,
        goal_b_id: b,
        relationship: input.relationship,
        note: note.length > 0 ? note : null,
      },
      { onConflict: 'user_id,goal_a_id,goal_b_id' },
    )
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/**
 * Removes a pair's mark, returning it to **unmarked**.
 *
 * Not "setting it to neutral" — that is the one thing this function must not be mistaken for.
 * Neutral is an answer the user gave; unmarked is the question going back to being unasked, and
 * `summariseEcology`'s examined share drops accordingly. Without this, the first tap on a pair
 * would be irreversible and the share could only ever climb, which is the inflation D49 exists to
 * prevent.
 */
export async function clearGoalPairMark(
  client: TypedSupabaseClient,
  userId: string,
  goalAId: number,
  goalBId: number,
): Promise<DataResult<null>> {
  const { a, b } = orderPair(goalAId, goalBId);
  const { error } = await client
    .from('goal_relationships')
    .delete()
    .eq('user_id', userId)
    .eq('goal_a_id', a)
    .eq('goal_b_id', b);
  if (error) return dataErr(mapDataError(error));
  return dataOk(null);
}

// ---------------------------------------------------------------------------
// Writes -- the Priority Matrix
// ---------------------------------------------------------------------------

export interface SetGoalPriorityScoresInput {
  goalId: number;
  visionAlignment: number;
  leverage: number;
  compoundBenefit: number;
  /** As the user scores it: HIGH means giving up a lot to do this. Stored as given, inverted only
   *  in `priorityComposite`, so the stored number always means what the user typed. */
  opportunityCost: number;
  scoredOn: LocalDate;
}

const SCORE_FIELDS = [
  ['visionAlignment', 'Vision alignment'],
  ['leverage', 'Leverage'],
  ['compoundBenefit', 'Compound benefit'],
  ['opportunityCost', 'Opportunity cost'],
] as const;

/**
 * Writes all four Priority Matrix scores for one goal.
 *
 * All four together, never one at a time: a composite over a half-filled matrix would be a number
 * derived from a question the user was still answering. The surface may collect them one tap at a
 * time, but nothing is stored until the set is complete — which is also why the four columns are
 * `not null` rather than nullable.
 *
 * The range check mirrors the DB CHECK with a friendlier message, the same division of labour
 * `logQuranSession` uses: the constraint is the guarantee, this is the explanation.
 */
export async function setGoalPriorityScores(
  client: TypedSupabaseClient,
  userId: string,
  input: SetGoalPriorityScoresInput,
): Promise<DataResult<GoalPriorityScoreRow>> {
  for (const [key, label] of SCORE_FIELDS) {
    const value = input[key];
    if (!Number.isInteger(value) || value < 1 || value > PRIORITY_MAX) {
      return dataErr({
        code: 'validation',
        message: `${label} has to be a whole number from 1 to ${PRIORITY_MAX}.`,
      });
    }
  }

  const { data, error } = await client
    .from('goal_priority_scores')
    .upsert(
      {
        goal_id: input.goalId,
        user_id: userId,
        vision_alignment: input.visionAlignment,
        leverage: input.leverage,
        compound_benefit: input.compoundBenefit,
        opportunity_cost: input.opportunityCost,
        scored_on: input.scoredOn,
      },
      { onConflict: 'goal_id' },
    )
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/**
 * Removes a goal's scores, returning it to unscored.
 *
 * The matrix is optional (D49), and optional has to include *un*-doing it. A goal whose scores are
 * cleared shows no composite again — it does not fall to the bottom of anything, because nothing
 * here sorts by composite in the first place.
 */
export async function clearGoalPriorityScores(
  client: TypedSupabaseClient,
  userId: string,
  goalId: number,
): Promise<DataResult<null>> {
  const { error } = await client
    .from('goal_priority_scores')
    .delete()
    .eq('user_id', userId)
    .eq('goal_id', goalId);
  if (error) return dataErr(mapDataError(error));
  return dataOk(null);
}

// ---------------------------------------------------------------------------
// The assembled read
// ---------------------------------------------------------------------------

export interface GoalEcologyView {
  /** The active goals, in War Map position order. The full rows, so a surface can show a goal the
   *  way the War Map already shows it rather than re-fetching. */
  goals: GoalRow[];
  /** Every unordered pair of active goals, marked or not. `relationship: null` is unmarked. */
  pairs: GoalPair[];
  /** Competing / synergistic / neutral / unmarked, plus the honest examined share. */
  summary: EcologySummary;
  /** One entry per goal, `composite: null` where nobody has scored it. Not sorted — see
   *  `scoreGoals`' own comment on why ranking by composite is the thing this feature refuses. */
  scored: ScoredGoal[];
}

function toGoalRef(row: GoalRow): GoalRef {
  return { id: row.id, title: row.title };
}

function toRelationshipRecord(row: GoalRelationshipRow): RelationshipRecord {
  return {
    goalAId: row.goal_a_id,
    goalBId: row.goal_b_id,
    relationship: row.relationship,
    note: row.note,
  };
}

function toPriorityScores(row: GoalPriorityScoreRow): PriorityScores {
  return {
    visionAlignment: row.vision_alignment,
    leverage: row.leverage,
    compoundBenefit: row.compound_benefit,
    opportunityCost: row.opportunity_cost,
    scoredOn: row.scored_on,
  };
}

/**
 * Everything the Goal Ecology surface renders, in one call.
 *
 * Three narrow reads, then `packages/core` does all of the deciding: `buildPairs` enumerates the
 * pairs and attaches the marks, `summariseEcology` splits them and computes the examined share,
 * `scoreGoals` attaches the composites. Web and mobile both call this, which is what stops the two
 * platforms from disagreeing about whether a pair has been examined.
 *
 * Scoped to ACTIVE goals, matching `listGoalsWithMilestones`. A retired goal's pairs disappear
 * from the surface but its rows stay in the table: history is history, and re-activating a goal
 * should not lose the sentence someone wrote about it.
 */
export async function loadGoalEcology(
  client: TypedSupabaseClient,
  userId: string,
): Promise<DataResult<GoalEcologyView>> {
  const goalsQuery = client
    .from('goals')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true)
    .order('position', { ascending: true });

  const [goalsResult, relationships, scores] = await Promise.all([
    goalsQuery,
    listGoalRelationships(client, userId),
    listGoalPriorityScores(client, userId),
  ]);
  if (goalsResult.error) return dataErr(mapDataError(goalsResult.error));
  if (!relationships.ok) return relationships;
  if (!scores.ok) return scores;

  const goals = goalsResult.data ?? [];
  const activeIds = new Set(goals.map((g) => g.id));
  const refs = goals.map(toGoalRef);

  // Marks whose pair is no longer both-active are dropped from the view rather than deleted. The
  // row is still true — those two goals did relate that way — and a surface that only shows active
  // goals has nowhere to render it.
  const marks = relationships.data
    .filter((row) => activeIds.has(row.goal_a_id) && activeIds.has(row.goal_b_id))
    .map(toRelationshipRecord);

  const pairs = buildPairs(refs, marks);
  const scoreMap = new Map(
    scores.data.filter((row) => activeIds.has(row.goal_id)).map((row) => [row.goal_id, toPriorityScores(row)]),
  );

  return dataOk({
    goals,
    pairs,
    summary: summariseEcology(pairs),
    scored: scoreGoals(refs, scoreMap),
  });
}
