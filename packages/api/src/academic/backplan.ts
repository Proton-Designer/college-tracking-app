import { buildBackplan, daysBetween, type Backplan, type DayCapacity, type DeliverableType, type LocalDate } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import { dataErr, dataOk, type DataResult } from '../data/types';
import { mapDataError } from '../data/errors';
import { calibrateCategory, loadCalibrationObservations } from '../day/calibration';

const DEFAULT_WAKING_HOURS_PER_DAY = 16;

function wakingMinutesPerDayFor(sleepBaselineHours: number | null): number {
  const hours = sleepBaselineHours != null ? Math.max(24 - sleepBaselineHours, 1) : DEFAULT_WAKING_HOURS_PER_DAY;
  return hours * 60;
}

async function computeDailyCapacity(
  client: TypedSupabaseClient,
  userId: string,
  today: LocalDate,
  dueDate: LocalDate,
  sleepBaselineHours: number | null,
): Promise<DayCapacity[]> {
  const windowDays = Math.max(daysBetween(today, dueDate), 0);
  const wakingMinutesPerDay = wakingMinutesPerDayFor(sleepBaselineHours);

  const { data: events, error } = await client
    .from('calendar_events')
    .select('start_at, end_at')
    .eq('user_id', userId)
    .eq('is_busy', true)
    .gte('start_at', `${today}T00:00:00Z`)
    .lte('start_at', `${dueDate}T23:59:59Z`);
  if (error) throw error;

  const busyMinutesByDate = new Map<LocalDate, number>();
  for (const event of events ?? []) {
    const date = new Date(event.start_at).toISOString().slice(0, 10);
    const minutes = Math.max(0, (new Date(event.end_at).getTime() - new Date(event.start_at).getTime()) / 60000);
    busyMinutesByDate.set(date, (busyMinutesByDate.get(date) ?? 0) + minutes);
  }

  return Array.from({ length: windowDays + 1 }, (_, i) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    const localDate = date.toISOString().slice(0, 10);
    const busy = busyMinutesByDate.get(localDate) ?? 0;
    return { date: localDate, availableMinutes: Math.max(0, wakingMinutesPerDay - busy) };
  });
}

export interface GenerateBackplanResult {
  backplanId: number;
  backplan: Backplan;
}

/**
 * Regenerates and persists a deliverable's backplan (packages/core §4). Backplans are a
 * LIVE plan, not an append-only snapshot (see docs/DATA_MODEL.md §3) -- this replaces
 * the prior backplan and its milestones rather than accumulating history.
 */
export async function generateAndPersistBackplan(
  client: TypedSupabaseClient,
  userId: string,
  deliverableId: number,
  today: LocalDate,
): Promise<DataResult<GenerateBackplanResult>> {
  const { data: deliverable, error: deliverableError } = await client
    .from('deliverables')
    .select('id, type, local_due_date, estimated_minutes')
    .eq('id', deliverableId)
    .eq('user_id', userId)
    .single();
  if (deliverableError) return dataErr(mapDataError(deliverableError));

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('timezone, sleep_baseline_hours')
    .eq('id', userId)
    .single();
  if (profileError) return dataErr(mapDataError(profileError));

  // The deliverable's own `type` (paper/exam/problem_set/...) doubles as its calibration
  // category -- deliverables have no separate free-text category the way tasks do, and
  // the type is already a meaningful, stable bucket for "how long does this kind of
  // thing actually take me".
  const calibrationObservations = await loadCalibrationObservations(client, userId, profile.timezone, new Date());
  const calibration = calibrateCategory(calibrationObservations, deliverable.type, today);
  const totalEffortMinutes = Math.round((deliverable.estimated_minutes ?? 60) * calibration.multiplier);

  const capacity = await computeDailyCapacity(
    client,
    userId,
    today,
    deliverable.local_due_date,
    profile.sleep_baseline_hours,
  );

  const backplan = buildBackplan({
    today,
    dueDate: deliverable.local_due_date,
    totalEffortMinutes,
    type: deliverable.type as DeliverableType,
    capacity,
  });

  // Replace: delete the prior backplan (cascades to its milestones) before inserting the
  // new one, rather than accumulating history -- see the module comment above.
  const { error: deleteError } = await client.from('deliverable_backplans').delete().eq('deliverable_id', deliverableId).eq('user_id', userId);
  if (deleteError) return dataErr(mapDataError(deleteError));

  const { data: backplanRow, error: insertError } = await client
    .from('deliverable_backplans')
    .insert({
      user_id: userId,
      deliverable_id: deliverableId,
      target_completion_date: backplan.targetCompletionDate,
      compressed: backplan.compressed,
      infeasible: backplan.infeasible,
      shortfall_minutes: Math.round(backplan.shortfallMinutes),
      dropped_phases: backplan.droppedPhases,
    })
    .select('id')
    .single();
  if (insertError) return dataErr(mapDataError(insertError));

  // backplan_milestones.minutes has a CHECK (minutes > 0) -- rounding a sub-minute
  // fractional allocation to the nearest integer can occasionally hit exactly 0, so
  // those are dropped rather than sent as an invalid row.
  const milestoneRows = backplan.milestones
    .map((m) => ({
      user_id: userId,
      backplan_id: backplanRow.id,
      phase: m.phase,
      milestone_date: m.date,
      minutes: Math.round(m.minutes),
    }))
    .filter((m) => m.minutes > 0);

  if (milestoneRows.length > 0) {
    const { error: milestoneError } = await client.from('backplan_milestones').insert(milestoneRows);
    if (milestoneError) return dataErr(mapDataError(milestoneError));
  }

  return dataOk({ backplanId: backplanRow.id, backplan });
}
