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

export interface CapacityDay extends DayCapacity {
  /** Minutes of committed (busy) calendar time this day -- what availableMinutes was
   *  derived FROM. SCREEN_SPEC.md §5: /calendar must show committed time against
   *  available capacity so congestion is visible, not inferred -- a bare
   *  availableMinutes doesn't convey whether that's a light day or a crushed one, only
   *  committedMinutes/wakingMinutes together do. */
  committedMinutes: number;
  /** The waking-window total (derived from sleep_baseline_hours, or the default) that
   *  availableMinutes and committedMinutes are both measured against. */
  wakingMinutes: number;
}

/**
 * Committed-vs-available minutes per day across [today, horizonEnd] -- originally
 * private to backplan generation (windowEnd was always one deliverable's due date), now
 * exported: /calendar needs the same committed/available split across a whole semester
 * horizon, not one deliverable's window. Same computation either way, just a wider or
 * narrower `horizonEnd`.
 */
export async function computeCapacityHorizon(
  client: TypedSupabaseClient,
  userId: string,
  today: LocalDate,
  horizonEnd: LocalDate,
  sleepBaselineHours: number | null,
): Promise<DataResult<CapacityDay[]>> {
  const windowDays = Math.max(daysBetween(today, horizonEnd), 0);
  const wakingMinutesPerDay = wakingMinutesPerDayFor(sleepBaselineHours);

  const { data: events, error } = await client
    .from('calendar_events')
    .select('start_at, end_at')
    .eq('user_id', userId)
    .eq('is_busy', true)
    .gte('start_at', `${today}T00:00:00Z`)
    .lte('start_at', `${horizonEnd}T23:59:59Z`);
  if (error) return dataErr(mapDataError(error));

  const busyMinutesByDate = new Map<LocalDate, number>();
  for (const event of events ?? []) {
    const date = new Date(event.start_at).toISOString().slice(0, 10);
    const minutes = Math.max(0, (new Date(event.end_at).getTime() - new Date(event.start_at).getTime()) / 60000);
    busyMinutesByDate.set(date, (busyMinutesByDate.get(date) ?? 0) + minutes);
  }

  const days = Array.from({ length: windowDays + 1 }, (_, i) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    const localDate = date.toISOString().slice(0, 10);
    const committedMinutes = busyMinutesByDate.get(localDate) ?? 0;
    return {
      date: localDate,
      availableMinutes: Math.max(0, wakingMinutesPerDay - committedMinutes),
      committedMinutes,
      wakingMinutes: wakingMinutesPerDay,
    };
  });

  return dataOk(days);
}

export interface GenerateBackplanResult {
  backplanId: number;
  backplan: Backplan;
}

/**
 * Regenerates and persists a deliverable's backplan (packages/core §4). Backplans are a
 * LIVE plan, not an append-only snapshot (see docs/DATA_MODEL.md §3) -- this replaces
 * the prior backplan and its milestones rather than accumulating history.
 *
 * Refuses to run (unless `force`) when the existing backplan has a milestone the user
 * has already marked done: regeneration deletes and reinserts milestones from scratch,
 * so without this guard, calling this to merely RENDER a page (a due date changed, the
 * UI re-fetches) would silently erase recorded progress -- the same class of bug as
 * regenerating on every page load, just with a slower fuse. `completed` is the only
 * mutable field on a milestone today, so it's the only thing there is to lose; there is
 * no schema support yet for tracking an edited date/effort allocation specifically.
 */
export async function generateAndPersistBackplan(
  client: TypedSupabaseClient,
  userId: string,
  deliverableId: number,
  today: LocalDate,
  options: { force?: boolean } = {},
): Promise<DataResult<GenerateBackplanResult>> {
  const { data: deliverable, error: deliverableError } = await client
    .from('deliverables')
    .select('id, type, local_due_date, estimated_minutes')
    .eq('id', deliverableId)
    .eq('user_id', userId)
    .single();
  if (deliverableError) return dataErr(mapDataError(deliverableError));

  if (!options.force) {
    const { data: existing, error: existingError } = await client
      .from('deliverable_backplans')
      .select('id, backplan_milestones(completed)')
      .eq('deliverable_id', deliverableId)
      .eq('user_id', userId)
      .maybeSingle();
    if (existingError) return dataErr(mapDataError(existingError));
    const hasCompletedMilestone = existing?.backplan_milestones?.some((m) => m.completed) ?? false;
    if (hasCompletedMilestone) {
      return dataErr({
        code: 'conflict',
        message: 'This plan has milestones already marked done. Regenerating would discard that progress -- pass force:true to regenerate anyway.',
      });
    }
  }

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

  const capacityResult = await computeCapacityHorizon(
    client,
    userId,
    today,
    deliverable.local_due_date,
    profile.sleep_baseline_hours,
  );
  if (!capacityResult.ok) return capacityResult;

  const backplan = buildBackplan({
    today,
    dueDate: deliverable.local_due_date,
    totalEffortMinutes,
    type: deliverable.type as DeliverableType,
    capacity: capacityResult.data,
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
