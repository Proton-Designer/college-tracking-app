export type TriggerSignalClass = 'physiological' | 'execution' | 'academic' | 'schedule';

interface SignalDefinition {
  key: string;
  points: number;
  class: TriggerSignalClass;
}

/** DOMAIN_ENGINE_SPEC.md §6 trigger-scoring table. */
const SIGNAL_DEFINITIONS: SignalDefinition[] = [
  { key: 'lowSleep', points: 2, class: 'physiological' },
  { key: 'lowWhoopRecovery', points: 1, class: 'physiological' },
  { key: 'overdueTasks', points: 2, class: 'execution' },
  { key: 'hardDeadlinesSoon', points: 2, class: 'academic' },
  { key: 'missedCheckin', points: 1, class: 'execution' },
  { key: 'zeroMitCompletion', points: 2, class: 'execution' },
  { key: 'heavyCalendar', points: 1, class: 'schedule' },
  { key: 'compressedBackplan', points: 2, class: 'academic' },
];

export const RECOVERY_MODE_THRESHOLD = 5;

export const PHYSIOLOGICAL_MAX_POSSIBLE = SIGNAL_DEFINITIONS.filter(
  (s) => s.class === 'physiological',
).reduce((sum, s) => sum + s.points, 0);

/**
 * The anti-excuse invariant (DOMAIN_ENGINE_SPEC.md §6): "Never let WHOOP become an excuse
 * generator." Physiology alone must never be able to trigger Recovery Mode. Asserted
 * structurally, computed from the same signal table used for scoring, so a future signal
 * addition that breaks the invariant fails loudly at import time instead of silently.
 */
if (PHYSIOLOGICAL_MAX_POSSIBLE >= RECOVERY_MODE_THRESHOLD) {
  throw new Error(
    `Anti-excuse invariant violated: physiological signals alone can total ` +
      `${PHYSIOLOGICAL_MAX_POSSIBLE}, which is >= the Recovery Mode threshold of ` +
      `${RECOVERY_MODE_THRESHOLD}. Physiology must never be able to trigger Recovery Mode alone.`,
  );
}

export interface RecoveryModeInput {
  sleepHours: number | null;
  sleepBaselineHours: number | null;
  whoopRecoveryPct: number | null;
  overdueTaskCount: number;
  hardDeadlinesWithin48h: number;
  missedYesterdayCheckin: boolean;
  yesterdayMitCompletionCount: number;
  committedCalendarHours: number;
  anyActiveBackplanCompressed: boolean;
}

export interface TriggerSignal {
  key: string;
  points: number;
  class: TriggerSignalClass;
  active: boolean;
}

export interface RecoveryModeResult {
  total: number;
  /** total >= threshold AND at least one non-physiological signal is active. */
  triggered: boolean;
  signals: TriggerSignal[];
  physiologicalTotal: number;
  nonPhysiologicalTotal: number;
}

function isSignalActive(key: string, input: RecoveryModeInput): boolean {
  switch (key) {
    case 'lowSleep':
      return (
        input.sleepHours != null &&
        input.sleepBaselineHours != null &&
        input.sleepHours < input.sleepBaselineHours - 1.5
      );
    case 'lowWhoopRecovery':
      return input.whoopRecoveryPct != null && input.whoopRecoveryPct < 34;
    case 'overdueTasks':
      return input.overdueTaskCount >= 3;
    case 'hardDeadlinesSoon':
      return input.hardDeadlinesWithin48h >= 2;
    case 'missedCheckin':
      return input.missedYesterdayCheckin;
    case 'zeroMitCompletion':
      return input.yesterdayMitCompletionCount === 0;
    case 'heavyCalendar':
      return input.committedCalendarHours > 8;
    case 'compressedBackplan':
      return input.anyActiveBackplanCompressed;
    default:
      return false;
  }
}

export function computeRecoveryModeTrigger(input: RecoveryModeInput): RecoveryModeResult {
  const signals: TriggerSignal[] = SIGNAL_DEFINITIONS.map((def) => ({
    ...def,
    active: isSignalActive(def.key, input),
  }));

  const total = signals.filter((s) => s.active).reduce((sum, s) => sum + s.points, 0);
  const physiologicalTotal = signals
    .filter((s) => s.active && s.class === 'physiological')
    .reduce((sum, s) => sum + s.points, 0);
  const nonPhysiologicalTotal = total - physiologicalTotal;

  return {
    total,
    triggered: total >= RECOVERY_MODE_THRESHOLD && nonPhysiologicalTotal > 0,
    signals,
    physiologicalTotal,
    nonPhysiologicalTotal,
  };
}
