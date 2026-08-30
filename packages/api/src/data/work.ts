import type { LocalDate } from '@collegeos/core';
import { addDays, isoWeekday, startOfWeek } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { getUserLocalToday } from '../day/today';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

/**
 * The Work domain's data layer. Fetch-and-write only, in the shape `deen.ts` established.
 *
 * Two properties of migration 53 shape everything in here:
 *
 * 1. **`status = 'done'` and `completed_at` are the same fact.** Both tables carry
 *    `..._completed_matches_status`, which makes the contradiction unrepresentable. Every
 *    status write below therefore sets or clears the timestamp in the same statement — a
 *    caller can never produce a "done" row with no completion time, or the reverse.
 *
 * 2. **A shift is recurring XOR dated.** `work_shifts_recurring_xor_dated` says exactly one
 *    of `weekday` / `local_date` is set. `createWorkShift` refuses the other two shapes with
 *    a sentence rather than letting the constraint surface as a raw violation, and
 *    `loadWorkOverview` resolves both shapes onto the same Sun–Sat week so the read is one
 *    list per day rather than two the UI has to merge.
 *
 * D40 is the default state: nothing is seeded. No targets, no tasks and no shifts is what
 * every one of the three users sees first, and it is an invitation rather than an empty
 * pipeline reported as failure. Nothing in this file fabricates a row to fill it.
 */

export type WorkTargetRow = Database['public']['Tables']['work_targets']['Row'];
export type WorkTargetTaskRow = Database['public']['Tables']['work_target_tasks']['Row'];
export type WorkShiftRow = Database['public']['Tables']['work_shifts']['Row'];
export type WorkTargetStatus = Database['public']['Enums']['work_target_status'];

/** The three lanes the pipeline is drawn as. `dropped` is a real status and deliberately not
 *  a lane: a dropped target is not work in progress, and giving it a column would make the
 *  board a graveyard. It is counted and named in a footnote instead of disappearing. */
export const WORK_PIPELINE_LANES: readonly WorkTargetStatus[] = ['active', 'blocked', 'done'] as const;

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listWorkTargets(
  client: TypedSupabaseClient,
  userId: string,
): Promise<DataResult<WorkTargetRow[]>> {
  const { data, error } = await client
    .from('work_targets')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

export async function listWorkShifts(
  client: TypedSupabaseClient,
  userId: string,
): Promise<DataResult<WorkShiftRow[]>> {
  const { data, error } = await client
    .from('work_shifts')
    .select('*')
    .eq('user_id', userId)
    .order('start_time', { ascending: true });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

// ---------------------------------------------------------------------------
// Writes -- targets and their tasks
// ---------------------------------------------------------------------------

export interface CreateWorkTargetInput {
  title: string;
  deadline?: LocalDate | null;
}

export async function createWorkTarget(
  client: TypedSupabaseClient,
  userId: string,
  input: CreateWorkTargetInput,
): Promise<DataResult<WorkTargetRow>> {
  const title = input.title.trim();
  if (title.length === 0) return dataErr({ code: 'validation', message: 'A target needs a title.' });

  const { data, error } = await client
    .from('work_targets')
    .insert({ user_id: userId, title, deadline: input.deadline ?? null })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/**
 * Moves a target between lanes.
 *
 * `completed_at` is written from the status rather than passed in, which is the only way the
 * DB's `(status = 'done') = (completed_at is not null)` check can be satisfied by every
 * caller without each of them remembering it. Re-marking an already-done target refreshes the
 * timestamp; that is a correction, not a second completion.
 */
export async function updateWorkTargetStatus(
  client: TypedSupabaseClient,
  userId: string,
  targetId: number,
  status: WorkTargetStatus,
): Promise<DataResult<WorkTargetRow>> {
  const { data, error } = await client
    .from('work_targets')
    .update({ status, completed_at: status === 'done' ? new Date().toISOString() : null })
    .eq('id', targetId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  if (!data) return dataErr({ code: 'not_found', message: 'That target could not be found.' });
  return dataOk(data);
}

export interface CreateWorkTargetTaskInput {
  targetId: number;
  title: string;
  deadline?: LocalDate | null;
}

export async function createWorkTargetTask(
  client: TypedSupabaseClient,
  userId: string,
  input: CreateWorkTargetTaskInput,
): Promise<DataResult<WorkTargetTaskRow>> {
  const title = input.title.trim();
  if (title.length === 0) return dataErr({ code: 'validation', message: 'A task needs a title.' });

  const { data, error } = await client
    .from('work_target_tasks')
    .insert({ user_id: userId, target_id: input.targetId, title, deadline: input.deadline ?? null })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export interface UpdateWorkTargetTaskStatusInput {
  status: WorkTargetStatus;
  /** What this is waiting on, in the user's own words. Only meaningful with `blocked`, and
   *  cleared automatically when the task leaves that status -- a stale "waiting on payroll"
   *  hanging off a finished task is worse than no reason at all. */
  blockedReason?: string | null;
}

export async function updateWorkTargetTaskStatus(
  client: TypedSupabaseClient,
  userId: string,
  taskId: number,
  input: UpdateWorkTargetTaskStatusInput,
): Promise<DataResult<WorkTargetTaskRow>> {
  const reason = input.status === 'blocked' ? (input.blockedReason?.trim() ?? '') : '';
  const { data, error } = await client
    .from('work_target_tasks')
    .update({
      status: input.status,
      completed_at: input.status === 'done' ? new Date().toISOString() : null,
      blocked_reason: reason.length > 0 ? reason : null,
    })
    .eq('id', taskId)
    .eq('user_id', userId)
    .select('*')
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  if (!data) return dataErr({ code: 'not_found', message: 'That task could not be found.' });
  return dataOk(data);
}

// ---------------------------------------------------------------------------
// Writes -- shifts
// ---------------------------------------------------------------------------

export interface CreateWorkShiftInput {
  /** ISO weekday, 1 = Monday .. 7 = Sunday, for a shift that repeats every week. */
  weekday?: number | null;
  /** A single dated shift. Exactly one of `weekday` / `localDate` is allowed. */
  localDate?: LocalDate | null;
  /** 'HH:MM' or 'HH:MM:SS' — a Postgres `time`, with no date and no zone. */
  startTime: string;
  endTime: string;
  label?: string | null;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/**
 * Adds a shift, in exactly one of the two shapes the table allows.
 *
 * The XOR is checked here as well as in the database because the two failure messages are
 * genuinely different advice — "pick a weekday or a date, not both" and "a shift needs one of
 * the two to sit on a calendar" — and a raw constraint violation says neither. The database
 * remains the guarantee; this is the explanation.
 *
 * An end before a start is allowed on purpose: an overnight shift (22:00–06:00) is a real
 * shift, and the table has no constraint against it. The UI labels it as crossing midnight
 * rather than treating it as an error.
 */
export async function createWorkShift(
  client: TypedSupabaseClient,
  userId: string,
  input: CreateWorkShiftInput,
): Promise<DataResult<WorkShiftRow>> {
  const weekday = input.weekday ?? null;
  const localDate = input.localDate ?? null;

  if (weekday != null && localDate != null) {
    return dataErr({
      code: 'validation',
      message: 'A shift either repeats on a weekday or falls on one date — not both.',
    });
  }
  if (weekday == null && localDate == null) {
    return dataErr({
      code: 'validation',
      message: 'Pick a weekday for a shift that repeats, or a date for a one-off.',
    });
  }
  if (weekday != null && (!Number.isInteger(weekday) || weekday < 1 || weekday > 7)) {
    return dataErr({ code: 'validation', message: 'Weekday has to be Monday through Sunday.' });
  }
  if (!TIME_RE.test(input.startTime) || !TIME_RE.test(input.endTime)) {
    return dataErr({ code: 'validation', message: 'Times go in as HH:MM, e.g. 09:00.' });
  }

  const label = input.label?.trim() ?? '';
  const { data, error } = await client
    .from('work_shifts')
    .insert({
      user_id: userId,
      weekday,
      local_date: localDate,
      start_time: input.startTime,
      end_time: input.endTime,
      label: label.length > 0 ? label : null,
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Removes a shift. A hard delete: a shift that is not happening was either never real or is
 *  no longer part of the schedule, and neither case is history worth keeping. */
export async function deleteWorkShift(
  client: TypedSupabaseClient,
  userId: string,
  shiftId: number,
): Promise<DataResult<null>> {
  const { data, error } = await client
    .from('work_shifts')
    .delete()
    .eq('id', shiftId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  if (!data) return dataErr({ code: 'not_found', message: 'That shift could not be found.' });
  return dataOk(null);
}

// ---------------------------------------------------------------------------
// The assembled read
// ---------------------------------------------------------------------------

export interface WorkTargetWithTasks {
  target: WorkTargetRow;
  tasks: WorkTargetTaskRow[];
}

export interface ShiftOnDay {
  shift: WorkShiftRow;
  /** True when this row is a weekly recurrence rather than a one-off on this date. Surfaced
   *  because "every Tuesday" and "this Tuesday" are different commitments to the reader. */
  recurring: boolean;
}

export interface ShiftDay {
  date: LocalDate;
  /** ISO weekday, 1 = Monday .. 7 = Sunday. */
  weekday: number;
  isToday: boolean;
  shifts: ShiftOnDay[];
}

export interface WorkOverview {
  today: LocalDate;
  timezone: string;
  /** Sunday of this week — `startOfWeek`, the same boundary every weekly surface uses. */
  weekStart: LocalDate;
  weekEnd: LocalDate;
  /** The three lanes, in `WORK_PIPELINE_LANES` order, each target carrying its own tasks. */
  pipeline: Record<'active' | 'blocked' | 'done', WorkTargetWithTasks[]>;
  /** Targets the user dropped. Not a lane; counted so the page can account for them without
   *  giving abandoned work a column of its own. */
  droppedCount: number;
  /** Sun..Sat, always seven entries. A day with no shifts carries an empty list, which the
   *  page renders as "nothing scheduled" — the honest answer, and not a zero. */
  week: ShiftDay[];
  /** True when there is not a single shift row of either shape. Distinguishes "no schedule
   *  has been entered" from "a schedule exists and this week happens to be clear". */
  hasAnyShift: boolean;
}

/**
 * Everything the Work page renders, in one call.
 *
 * Three reads. The only derivation is placing shifts on days, which is a calendar fact
 * (`isoWeekday` from `packages/core`) rather than a domain judgement — there is no Work
 * engine in `packages/core` for this to be bypassing.
 */
export async function loadWorkOverview(
  client: TypedSupabaseClient,
  userId: string,
  now: Date = new Date(),
): Promise<DataResult<WorkOverview>> {
  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('timezone')
    .eq('id', userId)
    .single();
  if (profileError) return dataErr(mapDataError(profileError));

  const timezone = profile.timezone;
  const today = getUserLocalToday(timezone, now);
  const weekStart = startOfWeek(today);
  const weekEnd = addDays(weekStart, 6);

  const [targetsResult, shiftsResult] = await Promise.all([
    listWorkTargets(client, userId),
    listWorkShifts(client, userId),
  ]);
  if (!targetsResult.ok) return targetsResult;
  if (!shiftsResult.ok) return shiftsResult;

  const targets = targetsResult.data;
  let tasks: WorkTargetTaskRow[] = [];
  if (targets.length > 0) {
    const { data, error } = await client
      .from('work_target_tasks')
      .select('*')
      .eq('user_id', userId)
      .in(
        'target_id',
        targets.map((t) => t.id),
      )
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) return dataErr(mapDataError(error));
    tasks = data ?? [];
  }

  const tasksByTarget = new Map<number, WorkTargetTaskRow[]>();
  for (const task of tasks) {
    const list = tasksByTarget.get(task.target_id);
    if (list) list.push(task);
    else tasksByTarget.set(task.target_id, [task]);
  }

  const withTasks = (status: WorkTargetStatus): WorkTargetWithTasks[] =>
    targets
      .filter((t) => t.status === status)
      .map((target) => ({ target, tasks: tasksByTarget.get(target.id) ?? [] }));

  const shifts = shiftsResult.data;
  const week: ShiftDay[] = [];
  for (let i = 0; i < 7; i += 1) {
    const date = addDays(weekStart, i);
    const weekday = isoWeekday(date);
    week.push({
      date,
      weekday,
      isToday: date === today,
      shifts: shifts
        .filter((s) => (s.local_date != null ? s.local_date === date : s.weekday === weekday))
        .map((shift) => ({ shift, recurring: shift.local_date == null })),
    });
  }

  return dataOk({
    today,
    timezone,
    weekStart,
    weekEnd,
    pipeline: {
      active: withTasks('active'),
      blocked: withTasks('blocked'),
      done: withTasks('done'),
    },
    droppedCount: targets.filter((t) => t.status === 'dropped').length,
    week,
    hasAnyShift: shifts.length > 0,
  });
}
