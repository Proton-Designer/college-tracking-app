import type { Confidence, LocalDate } from '../types.js';
import { compareLocalDate, daysBetween } from '../util/date.js';

const RECENT_EPISODE_WINDOW = 5;
const HALF_LIFE_EPISODES = 3;

export interface DayOutcome {
  date: LocalDate;
  outcome: 'success' | 'failure' | 'untracked';
}

export interface LapseEpisode {
  startDate: LocalDate;
  endDate: LocalDate;
  recoveryDays: number;
}

export type BounceBackTrend = 'improving' | 'stable' | 'worsening' | 'insufficient';

export interface BounceBackResult {
  score: number;
  confidence: Confidence;
  closedEpisodeCount: number;
  ongoingLapseDays: number;
  trend: BounceBackTrend;
  trendDelta: number | null;
  lapseRatePer30Days: number;
}

function extractEpisodes(seriesAscending: DayOutcome[]): { closed: LapseEpisode[]; openStart: LocalDate | null } {
  let lapseStart: LocalDate | null = null;
  const closed: LapseEpisode[] = [];

  for (const entry of seriesAscending) {
    if (entry.outcome === 'failure') {
      if (lapseStart === null) lapseStart = entry.date;
    } else if (entry.outcome === 'success') {
      if (lapseStart !== null) {
        closed.push({ startDate: lapseStart, endDate: entry.date, recoveryDays: daysBetween(lapseStart, entry.date) });
        lapseStart = null;
      }
    }
    // 'untracked' is a gap: it neither starts nor ends a lapse, and must never be
    // silently treated as a recovery — DOMAIN_ENGINE_SPEC.md §5.
  }

  return { closed, openStart: lapseStart };
}

/** Bounce-back score — DOMAIN_ENGINE_SPEC.md §5. Measures time-to-recovery, not streaks. */
export function computeBounceBack(series: DayOutcome[]): BounceBackResult {
  const sorted = [...series].sort((a, b) => compareLocalDate(a.date, b.date));
  const { closed, openStart } = extractEpisodes(sorted);

  const firstDate = sorted.length > 0 ? sorted[0]!.date : null;
  const lastDate = sorted.length > 0 ? sorted[sorted.length - 1]!.date : null;

  const ongoingLapseDays = openStart !== null && lastDate !== null ? daysBetween(openStart, lastDate) : 0;

  const totalLapseCount = closed.length + (openStart !== null ? 1 : 0);
  const spanDays = firstDate !== null && lastDate !== null ? daysBetween(firstDate, lastDate) + 1 : 0;
  const lapseRatePer30Days = spanDays > 0 ? (totalLapseCount / spanDays) * 30 : 0;

  if (closed.length === 0) {
    // Distinguish "perfect" (no lapse ever observed) from "unresolved" (currently failing
    // with zero proven recoveries) — reporting 100 for the latter would be exactly the
    // flattering nonsense this metric exists to avoid.
    const neverLapsed = totalLapseCount === 0;
    return {
      score: neverLapsed ? 100 : 0,
      confidence: 'insufficient',
      closedEpisodeCount: 0,
      ongoingLapseDays,
      trend: 'insufficient',
      trendDelta: null,
      lapseRatePer30Days,
    };
  }

  const recent = closed.slice(-RECENT_EPISODE_WINDOW);
  const n = recent.length;
  const weights = recent.map((_, i) => Math.pow(0.5, (n - 1 - i) / HALF_LIFE_EPISODES));
  const sumW = weights.reduce((s, w) => s + w, 0);
  const meanRecovery = recent.reduce((s, ep, i) => s + weights[i]! * ep.recoveryDays, 0) / sumW;
  const score = Math.round(100 * Math.exp(-(meanRecovery - 1) / 2));

  const half = Math.floor(n / 2);
  let trend: BounceBackTrend = 'insufficient';
  let trendDelta: number | null = null;
  if (half >= 1) {
    const oldestHalf = recent.slice(0, half);
    const newestHalf = recent.slice(n - half);
    const oldestMean = oldestHalf.reduce((s, e) => s + e.recoveryDays, 0) / oldestHalf.length;
    const newestMean = newestHalf.reduce((s, e) => s + e.recoveryDays, 0) / newestHalf.length;
    trendDelta = newestMean - oldestMean;
    trend = trendDelta < 0 ? 'improving' : trendDelta > 0 ? 'worsening' : 'stable';
  }

  const confidence: Confidence = closed.length >= 5 ? 'high' : closed.length >= 3 ? 'moderate' : 'low';

  return { score, confidence, closedEpisodeCount: closed.length, ongoingLapseDays, trend, trendDelta, lapseRatePer30Days };
}
