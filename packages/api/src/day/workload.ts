import {
  computeAssignmentRisk,
  computeCapacityMinutes,
  computeWorkloadLevels,
  daysBetween,
  recoveryAdjustmentFromWhoopPct,
  type Confidence,
  type LocalDate,
  type WorkloadItem,
  type WorkloadLevels,
} from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { DurationObservation } from '@collegeos/core';
import { calibrateCategory } from './calibration';
import type { DeliverableRisk } from './risk';

const DEFAULT_WAKING_HOURS_PER_DAY = 16;
const HARD_DEADLINE_WINDOW_DAYS = 2;

/** Personal waking window when known (Lead ruling, L5), else the documented default. */
function wakingMinutesPerDayFor(sleepBaselineHours: number | null): number {
  const hours = sleepBaselineHours != null ? Math.max(24 - sleepBaselineHours, 1) : DEFAULT_WAKING_HOURS_PER_DAY;
  return hours * 60;
}

export interface CalibrationObservations {
  byCategory: Map<string, DurationObservation[]>;
  global: DurationObservation[];
}

/**
 * The true marginal risk reduction from completing one more unit of a deliverable —
 * re-runs packages/core's risk engine with completedUnits+1 rather than approximating
 * from the raw score, since the engine's factors don't combine linearly.
 */
export function marginalRiskReduction(deliverableRisk: DeliverableRisk): number {
  const improved = computeAssignmentRisk({
    ...deliverableRisk.input,
    completedUnits: deliverableRisk.input.completedUnits + 1,
  });
  return Math.max(0, deliverableRisk.result.score - improved.score);
}

function eventDurationMinutes(event: { start_at: string; end_at: string }): number {
  return Math.max(0, (new Date(event.end_at).getTime() - new Date(event.start_at).getTime()) / 60000);
}

export interface ItemCalibration {
  multiplier: number;
  confidence: Confidence;
}

export interface WorkloadItemsResult {
  items: WorkloadItem[];
  /** Multiplier + confidence behind each discretionary item's (already-calibrated)
   *  estimatedMinutes, keyed by item id -- see rankSuggestedMits, which surfaces this on
   *  SuggestedMit so the UI can flag a weak estimate rather than presenting it as fact. */
  calibrationByItemId: Map<string, ItemCalibration>;
}

export async function buildTodayWorkloadItems(
  client: TypedSupabaseClient,
  userId: string,
  today: LocalDate,
  deliverableRisks: DeliverableRisk[],
  calibration: CalibrationObservations,
): Promise<WorkloadItemsResult> {
  const [{ data: tasks, error: taskError }, { data: events, error: eventError }] = await Promise.all([
    client
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .eq('planned_date', today)
      .not('status', 'in', '(completed,cancelled)'),
    client
      .from('calendar_events')
      .select('*')
      .eq('user_id', userId)
      .eq('is_busy', true)
      .gte('start_at', `${today}T00:00:00Z`)
      .lt('start_at', `${today}T23:59:59Z`),
  ]);
  if (taskError) throw taskError;
  if (eventError) throw eventError;

  const riskByDeliverable = new Map(deliverableRisks.map((r) => [r.deliverableId, r]));

  const items: WorkloadItem[] = [];
  const calibrationByItemId = new Map<string, ItemCalibration>();

  for (const event of events ?? []) {
    items.push({ id: `event-${event.id}`, kind: 'attendance', estimatedMinutes: eventDurationMinutes(event) });
  }

  for (const task of tasks ?? []) {
    const deliverableRisk = task.deliverable_id != null ? riskByDeliverable.get(task.deliverable_id) : undefined;
    const isHardDeadline =
      deliverableRisk != null && daysBetween(today, deliverableRisk.input.dueDate) <= HARD_DEADLINE_WINDOW_DAYS;

    const calibrated = calibrateCategory(calibration, task.category, today);
    const baseEstimate = task.estimated_minutes ?? 30;
    const estimatedMinutes = Math.round(baseEstimate * calibrated.multiplier);
    const itemId = String(task.id);

    items.push({
      id: itemId,
      kind: isHardDeadline ? 'hardDeadline' : 'discretionary',
      estimatedMinutes,
      ...(deliverableRisk ? { riskReduction: marginalRiskReduction(deliverableRisk) } : {}),
    });
    calibrationByItemId.set(itemId, { multiplier: calibrated.multiplier, confidence: calibrated.confidence });
  }

  return { items, calibrationByItemId };
}

export interface TodayWorkload {
  items: WorkloadItem[];
  levels: WorkloadLevels;
  calibrationByItemId: Map<string, ItemCalibration>;
}

export async function computeTodayWorkload(
  client: TypedSupabaseClient,
  userId: string,
  today: LocalDate,
  deliverableRisks: DeliverableRisk[],
  calibration: CalibrationObservations,
  historicalDeepWorkP50Minutes: number,
  whoopRecoveryPct: number | null,
  sleepBaselineHours: number | null,
): Promise<TodayWorkload> {
  const { items, calibrationByItemId } = await buildTodayWorkloadItems(client, userId, today, deliverableRisks, calibration);

  const wakingMinutesPerDay = wakingMinutesPerDayFor(sleepBaselineHours);
  const busyMinutesToday = items
    .filter((i) => i.kind === 'attendance')
    .reduce((sum, i) => sum + i.estimatedMinutes, 0);
  const freeCalendarMinutes = Math.max(0, wakingMinutesPerDay - busyMinutesToday);

  // WHOOP-band-anchored (red/yellow/green), not an arbitrary linear scale -- see
  // packages/core's recoveryAdjustmentFromWhoopPct for why.
  const recoveryAdjustment = recoveryAdjustmentFromWhoopPct(whoopRecoveryPct);

  const capacityMinutes = computeCapacityMinutes({
    historicalDeepWorkP50Minutes,
    recoveryAdjustment,
    freeCalendarMinutes,
    typicalFreeMinutes: wakingMinutesPerDay,
  });

  return { items, levels: computeWorkloadLevels(items, capacityMinutes), calibrationByItemId };
}

export interface SuggestedMit {
  taskId: number;
  rank: number;
  riskReductionPerMinute: number;
  /** Already calibration-adjusted -- see WorkloadItem.estimatedMinutes in
   *  buildTodayWorkloadItems -- never the raw Task.estimated_minutes. */
  calibratedMinutes: number;
  calibrationMultiplier: number;
  calibrationConfidence: Confidence;
}

/** Top 3 discretionary items ranked by risk reduction per calibrated minute — packages/core
 *  §7's own selection criterion, just surfaced directly rather than only used to fill Target. */
export function rankSuggestedMits(
  items: WorkloadItem[],
  calibrationByItemId: Map<string, ItemCalibration>,
  limit = 3,
): SuggestedMit[] {
  return items
    .filter((i) => i.kind === 'discretionary')
    .map((i) => ({
      taskId: Number(i.id),
      estimatedMinutes: i.estimatedMinutes,
      ratio: (i.riskReduction ?? 0) / Math.max(i.estimatedMinutes, 1e-9),
      calibration: calibrationByItemId.get(i.id) ?? { multiplier: 1, confidence: 'insufficient' as Confidence },
    }))
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, limit)
    .map((i, index) => ({
      taskId: i.taskId,
      rank: index + 1,
      riskReductionPerMinute: i.ratio,
      calibratedMinutes: i.estimatedMinutes,
      calibrationMultiplier: i.calibration.multiplier,
      calibrationConfidence: i.calibration.confidence,
    }));
}
