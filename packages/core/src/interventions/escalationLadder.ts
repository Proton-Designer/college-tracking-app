/**
 * Commitment escalation ladder (the brief, borrowed from Beeminder): L0 reminder -> L1
 * stronger notification -> L2 distraction apps blocked -> L3 accountability partner
 * notified -> L4 predetermined consequence. Two hard rules, both enforced here:
 *
 * 1. "Do not begin with punishment." Escalation is earned by REPEATED failure of
 *    weaker interventions, not a single bad day -- gated on a minimum relapse count
 *    since the ladder last moved, not on any single event.
 * 2. "Levels 2-4 are opt-in per behavior." This function will recommend escalating
 *    past L1 on the evidence alone; the caller (day/interventionEvaluation.ts) is
 *    responsible for clamping the recommendation to the habit's own
 *    max_escalation_level before ever actually changing escalation_level in the DB --
 *    kept as two separate steps (evidence -> recommendation -> opt-in-clamped action)
 *    so "what the evidence supports" and "what the user has actually allowed" are
 *    never conflated into one number.
 */

export type CommitmentLevel = 'l0_reminder' | 'l1_stronger_notification' | 'l2_distraction_block' | 'l3_accountability_partner' | 'l4_consequence';

const LEVEL_ORDER: readonly CommitmentLevel[] = ['l0_reminder', 'l1_stronger_notification', 'l2_distraction_block', 'l3_accountability_partner', 'l4_consequence'];

export interface EscalationEvaluationInput {
  currentLevel: CommitmentLevel;
  /** Relapses logged since the ladder was last moved to currentLevel (or since the
   *  habit was created, if it's never moved) -- "repeatedly failed despite weaker
   *  interventions" is measured from the current level's own start, not all-time,
   *  since all-time would keep escalating forever even after real improvement. */
  relapsesSinceLevelSet: number;
  /** "Repeated" -- default 3, a real threshold, not "the first time it happens." */
  minRelapsesToEscalate?: number;
}

export interface EscalationDecision {
  shouldEscalate: boolean;
  /** The next level the EVIDENCE supports -- not yet clamped to what the habit has
   *  opted into. Null when there's nothing to escalate to (already at l4) or the
   *  evidence doesn't support it. */
  recommendedNextLevel: CommitmentLevel | null;
  reason: string | null;
}

const DEFAULT_MIN_RELAPSES_TO_ESCALATE = 3;

export function evaluateEscalation(input: EscalationEvaluationInput): EscalationDecision {
  const currentIndex = LEVEL_ORDER.indexOf(input.currentLevel);
  if (currentIndex === LEVEL_ORDER.length - 1) {
    return { shouldEscalate: false, recommendedNextLevel: null, reason: null }; // already at the ceiling
  }

  const minRelapses = input.minRelapsesToEscalate ?? DEFAULT_MIN_RELAPSES_TO_ESCALATE;
  if (input.relapsesSinceLevelSet < minRelapses) {
    return { shouldEscalate: false, recommendedNextLevel: null, reason: null };
  }

  const recommendedNextLevel = LEVEL_ORDER[currentIndex + 1]!;
  const reason = `${input.relapsesSinceLevelSet} relapses since this level was set (threshold: ${minRelapses}) -- the current intervention hasn't held.`;
  return { shouldEscalate: true, recommendedNextLevel, reason };
}

/** Clamps an evidence-based recommendation to what the habit has actually opted into
 *  -- the structural enforcement of "levels 2-4 are opt-in per behavior." Returns null
 *  (no escalation happens) rather than silently capping at the ceiling, so the caller
 *  can distinguish "nothing to do" from "evidence says escalate, but the user hasn't
 *  authorized going that far" -- the latter is worth surfacing to the user as a
 *  decision point, not silently discarding. */
export function clampEscalationToOptIn(recommendedNextLevel: CommitmentLevel, maxEscalationLevel: CommitmentLevel): CommitmentLevel | null {
  const recommendedIndex = LEVEL_ORDER.indexOf(recommendedNextLevel);
  const maxIndex = LEVEL_ORDER.indexOf(maxEscalationLevel);
  return recommendedIndex <= maxIndex ? recommendedNextLevel : null;
}
