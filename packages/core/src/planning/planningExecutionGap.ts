import { clamp01 } from '../util/math';

const QUALITY_HIGH_LOW_THRESHOLD = 50;

export type PlanningExecutionDiagnosis =
  | 'overplanning'
  | 'executionProblem'
  | 'underplanning'
  | 'calibrated';

export interface PlanningExecutionInput {
  plannedDeepWorkMin: number;
  actualDeepWorkMin: number;
  historicalCapacityP50Min: number;
  /** Minutes since midnight. */
  plannedStartMin: number;
  actualStartMin: number;
  mitPlanned: number;
  mitCompleted: number;
}

export interface PlanningExecutionResult {
  executionQuality: number;
  planningQuality: number;
  startDelayMin: number;
  mitPlanned: number;
  mitCompleted: number;
  diagnosis: PlanningExecutionDiagnosis;
}

/**
 * Two separate scores, deliberately not blended — DOMAIN_ENGINE_SPEC.md §8. A blended
 * number would hide whether the real failure is overplanning vs weak execution. The
 * high/low split uses the natural midpoint (50) of the 0-100 quality scale.
 */
export function computePlanningExecutionGap(input: PlanningExecutionInput): PlanningExecutionResult {
  const executionQuality =
    input.plannedDeepWorkMin <= 0
      ? 100
      : clamp01(input.actualDeepWorkMin / input.plannedDeepWorkMin) * 100;

  const planningQuality =
    input.historicalCapacityP50Min <= 0
      ? 100
      : 100 *
        (1 -
          clamp01(
            Math.abs(input.plannedDeepWorkMin - input.historicalCapacityP50Min) /
              input.historicalCapacityP50Min,
          ));

  const executionHigh = executionQuality >= QUALITY_HIGH_LOW_THRESHOLD;
  const planningHigh = planningQuality >= QUALITY_HIGH_LOW_THRESHOLD;

  let diagnosis: PlanningExecutionDiagnosis;
  if (!executionHigh && !planningHigh) diagnosis = 'overplanning';
  else if (!executionHigh && planningHigh) diagnosis = 'executionProblem';
  else if (executionHigh && !planningHigh) diagnosis = 'underplanning';
  else diagnosis = 'calibrated';

  return {
    executionQuality,
    planningQuality,
    startDelayMin: input.actualStartMin - input.plannedStartMin,
    mitPlanned: input.mitPlanned,
    mitCompleted: input.mitCompleted,
    diagnosis,
  };
}
