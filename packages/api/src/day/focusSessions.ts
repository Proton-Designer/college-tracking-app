import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from '../data/types';
import { mapDataError } from '../data/errors';

export type TaskSessionRow = Database['public']['Tables']['task_sessions']['Row'];
export type FocusSessionStatus = 'active' | 'completed' | 'abandoned';

export interface StartFocusSessionInput {
  taskId: number;
  plannedDurationMin: number;
  location?: string;
}

/**
 * Starts a focus session. planned_start and actual_start are both stamped from the
 * server clock (`now`), never client-supplied -- there's no advance-scheduling mechanism
 * yet (a task has a planned_date but no time-of-day), so "start delay" is 0 by
 * construction for a session created this way. The day-level start-delay metric
 * (day/planningExecution.ts, packages/core's planningExecutionGap) still reads
 * correctly against real data; it just has nothing to report until a scheduling step
 * exists to make planned_start meaningfully earlier than actual_start.
 *
 * "At most one active session per user" is enforced at the DB level (migration 0012's
 * partial unique index) -- this pre-check exists only so a caller gets a clear message
 * instead of interpreting a raw unique-violation.
 */
export async function startFocusSession(
  client: TypedSupabaseClient,
  userId: string,
  input: StartFocusSessionInput,
  now: Date = new Date(),
): Promise<DataResult<TaskSessionRow>> {
  const { data: existing, error: existingError } = await client
    .from('task_sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (existingError) return dataErr(mapDataError(existingError));
  if (existing) {
    return dataErr({
      code: 'conflict',
      message: 'You already have an active focus session. Stop or abandon it before starting another.',
    });
  }

  const nowIso = now.toISOString();
  const { data, error } = await client
    .from('task_sessions')
    .insert({
      user_id: userId,
      task_id: input.taskId,
      planned_start: nowIso,
      actual_start: nowIso,
      planned_duration_min: input.plannedDurationMin,
      status: 'active',
      ...(input.location != null ? { location: input.location } : {}),
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export interface EndFocusSessionInput {
  sessionId: number;
  interruptions?: number;
  /** 1-5. Enforced by the DB check constraint; an out-of-range value surfaces as a
   *  'validation' DataError rather than being clamped or silently accepted. */
  subjectiveFocus?: number;
  objectiveOutput?: string;
  phoneUsageMin?: number;
}

async function endFocusSession(
  client: TypedSupabaseClient,
  userId: string,
  status: 'completed' | 'abandoned',
  input: EndFocusSessionInput,
  now: Date,
): Promise<DataResult<TaskSessionRow>> {
  const { data: session, error: fetchError } = await client
    .from('task_sessions')
    .select('id, actual_start, status')
    .eq('id', input.sessionId)
    .eq('user_id', userId)
    .maybeSingle();
  if (fetchError) return dataErr(mapDataError(fetchError));
  if (!session) return dataErr({ code: 'not_found', message: 'That focus session could not be found.' });
  if (session.status !== 'active') {
    return dataErr({ code: 'conflict', message: `This session is already ${session.status}, not active.` });
  }

  // actual_duration_min is ALWAYS server-computed from the wall-clock gap between the
  // stored actual_start and now -- never a client-supplied number, and exactly what
  // makes a session resumable across a background/kill: the client never owns elapsed
  // time, it re-derives it from actual_start whenever it needs to display it, and the
  // server re-derives it the same way when the session actually ends.
  const actualDurationMin = Math.max(
    0,
    Math.round((now.getTime() - new Date(session.actual_start!).getTime()) / 60000),
  );

  const { data, error } = await client
    .from('task_sessions')
    .update({
      status,
      actual_duration_min: actualDurationMin,
      ...(input.interruptions != null ? { interruptions: input.interruptions } : {}),
      ...(input.subjectiveFocus != null ? { subjective_focus: input.subjectiveFocus } : {}),
      ...(input.objectiveOutput != null ? { objective_output: input.objectiveOutput } : {}),
      ...(input.phoneUsageMin != null ? { phone_usage_min: input.phoneUsageMin } : {}),
    })
    .eq('id', input.sessionId)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Ends a session normally -- counts toward calibration (day/calibration.ts filters on
 *  status='completed' specifically because of this distinction). */
export async function completeFocusSession(
  client: TypedSupabaseClient,
  userId: string,
  input: EndFocusSessionInput,
  now: Date = new Date(),
): Promise<DataResult<TaskSessionRow>> {
  return endFocusSession(client, userId, 'completed', input, now);
}

/** Ends a session early. actual_duration_min is still recorded (real elapsed time), but
 *  this status excludes it from calibration -- see the module comment on 'abandoned'. */
export async function abandonFocusSession(
  client: TypedSupabaseClient,
  userId: string,
  input: EndFocusSessionInput,
  now: Date = new Date(),
): Promise<DataResult<TaskSessionRow>> {
  return endFocusSession(client, userId, 'abandoned', input, now);
}

/**
 * The one session (if any) a client should resume on launch/foreground -- reads
 * actual_start so the caller can recompute elapsed wall-clock time locally rather than
 * trusting a JS interval that stopped when the app was backgrounded or killed.
 */
export async function getActiveFocusSession(
  client: TypedSupabaseClient,
  userId: string,
): Promise<DataResult<TaskSessionRow | null>> {
  const { data, error } = await client
    .from('task_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
