export type InsightConfidenceLevel = 'high' | 'medium' | 'testing';

export interface InsightEvidenceInput {
  sampleSize: number;
  /** Whether the effect holds when the observation window is split in half. */
  effectHoldsInBothHalves: boolean;
  effectSize: number;
  noiseFloor: number;
  /** Whether the effect's direction (sign) is consistent across observations. */
  consistentDirection: boolean;
}

const LEVEL_RANK: Record<InsightConfidenceLevel, number> = { testing: 0, medium: 1, high: 2 };

/**
 * Deterministic confidence gate — DOMAIN_ENGINE_SPEC.md §10. Enforced in code so the LLM
 * cannot promote its own conclusions.
 */
export function gateInsightConfidence(input: InsightEvidenceInput): InsightConfidenceLevel {
  if (
    input.sampleSize >= 20 &&
    input.effectHoldsInBothHalves &&
    Math.abs(input.effectSize) > input.noiseFloor
  ) {
    return 'high';
  }
  if (input.sampleSize >= 10 && input.consistentDirection) {
    return 'medium';
  }
  return 'testing';
}

/**
 * Clamps a model-claimed confidence to the ceiling the evidence actually supports. Never
 * upgrades — a model that claims lower confidence than the evidence would allow is left
 * alone, since being more conservative than the evidence is not the failure mode this
 * gate exists to prevent.
 */
export function clampInsightConfidence(
  claimed: InsightConfidenceLevel,
  evidence: InsightEvidenceInput,
): InsightConfidenceLevel {
  const allowed = gateInsightConfidence(evidence);
  return LEVEL_RANK[claimed] <= LEVEL_RANK[allowed] ? claimed : allowed;
}
