import type { LocalDate } from '../types.js';

const TREND_STABLE_THRESHOLD_PP = 0.5;

export interface FrictionLog {
  date: LocalDate;
  cause: string;
}

export interface CauseDistributionEntry {
  cause: string;
  count: number;
  percentage: number;
}

export interface FrictionDistribution {
  /** Ranked descending by count, alphabetical tiebreak. */
  entries: CauseDistributionEntry[];
  totalCount: number;
}

/** Pure counting, no inference — DOMAIN_ENGINE_SPEC.md §9. */
export function computeFrictionDistribution(logs: FrictionLog[]): FrictionDistribution {
  const counts = new Map<string, number>();
  for (const log of logs) {
    counts.set(log.cause, (counts.get(log.cause) ?? 0) + 1);
  }

  const totalCount = logs.length;
  const entries = [...counts.entries()]
    .map(([cause, count]) => ({
      cause,
      count,
      percentage: totalCount > 0 ? (count / totalCount) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.cause.localeCompare(b.cause));

  return { entries, totalCount };
}

export type FrictionTrendDirection = 'up' | 'down' | 'stable';

export interface CauseTrendEntry {
  cause: string;
  previousPercentage: number;
  currentPercentage: number;
  deltaPercentagePoints: number;
  direction: FrictionTrendDirection;
}

/**
 * Per-cause trend across two consecutive windows. A +/-0.5 percentage-point band is
 * treated as noise rather than a trend — a documented threshold, not in the spec text.
 */
export function computeFrictionTrend(
  previousWindowLogs: FrictionLog[],
  currentWindowLogs: FrictionLog[],
): CauseTrendEntry[] {
  const previous = computeFrictionDistribution(previousWindowLogs);
  const current = computeFrictionDistribution(currentWindowLogs);

  const previousByCause = new Map(previous.entries.map((e) => [e.cause, e.percentage]));
  const currentByCause = new Map(current.entries.map((e) => [e.cause, e.percentage]));
  const allCauses = new Set([...previousByCause.keys(), ...currentByCause.keys()]);

  return [...allCauses]
    .map((cause) => {
      const previousPercentage = previousByCause.get(cause) ?? 0;
      const currentPercentage = currentByCause.get(cause) ?? 0;
      const deltaPercentagePoints = currentPercentage - previousPercentage;
      const direction: FrictionTrendDirection =
        deltaPercentagePoints > TREND_STABLE_THRESHOLD_PP
          ? 'up'
          : deltaPercentagePoints < -TREND_STABLE_THRESHOLD_PP
            ? 'down'
            : 'stable';
      return { cause, previousPercentage, currentPercentage, deltaPercentagePoints, direction };
    })
    .sort((a, b) => b.currentPercentage - a.currentPercentage || a.cause.localeCompare(b.cause));
}
