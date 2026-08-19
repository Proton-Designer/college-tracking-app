const RECOVERY_ADJUSTMENT_MIN = 0.75;
const RECOVERY_ADJUSTMENT_MAX = 1.1;

export interface ComputeCapacityInput {
  historicalDeepWorkP50Minutes: number;
  /** Caller-supplied WHOOP-recovery-derived adjustment; clamped defensively here. */
  recoveryAdjustment: number;
  freeCalendarMinutes: number;
  typicalFreeMinutes: number;
}

/** Calibrated daily capacity — DOMAIN_ENGINE_SPEC.md §7. */
export function computeCapacityMinutes(input: ComputeCapacityInput): number {
  const adjustment = Math.min(
    RECOVERY_ADJUSTMENT_MAX,
    Math.max(RECOVERY_ADJUSTMENT_MIN, input.recoveryAdjustment),
  );
  const freeRatio =
    input.typicalFreeMinutes > 0 ? input.freeCalendarMinutes / input.typicalFreeMinutes : 1;
  return input.historicalDeepWorkP50Minutes * adjustment * freeRatio;
}
