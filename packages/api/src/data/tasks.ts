import type { LocalDate } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type Task = Database['public']['Tables']['tasks']['Row'];
export type TaskInsert = Database['public']['Tables']['tasks']['Insert'];
export type TaskStatus = Task['status'];

export async function listTasksForDate(
  client: TypedSupabaseClient,
  localDate: LocalDate,
): Promise<DataResult<Task[]>> {
  const { data, error } = await client
    .from('tasks')
    .select('*')
    .eq('planned_date', localDate)
    .order('mit_rank', { nullsFirst: false })
    .order('created_at');
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function listOverdueTasks(
  client: TypedSupabaseClient,
  beforeDate: LocalDate,
): Promise<DataResult<Task[]>> {
  const { data, error } = await client
    .from('tasks')
    .select('*')
    .lt('planned_date', beforeDate)
    .neq('status', 'completed')
    .neq('status', 'cancelled')
    .order('planned_date');
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function createTask(client: TypedSupabaseClient, input: TaskInsert): Promise<DataResult<Task>> {
  const { data, error } = await client.from('tasks').insert(input).select().single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function updateTaskStatus(
  client: TypedSupabaseClient,
  taskId: number,
  status: TaskStatus,
): Promise<DataResult<Task>> {
  if (status === 'completed') {
    const { data: task, error: fetchError } = await client
      .from('tasks')
      .select('requires_proof_of_work, proof_of_work_content')
      .eq('id', taskId)
      .single();
    if (fetchError) return dataErr(mapDataError(fetchError));
    // The gate that makes requires_proof_of_work mean something: without this, it's a
    // column the UI can choose to check, not a real requirement -- same class of issue
    // as a client-side-only confirmation check (see syllabus-confirm's own reasoning).
    if (task.requires_proof_of_work && !task.proof_of_work_content) {
      return dataErr({
        code: 'validation',
        message: 'This task requires proof of work before it can be marked complete.',
      });
    }
  }

  const { data, error } = await client
    .from('tasks')
    .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
    .eq('id', taskId)
    .select()
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export interface UpdateTaskInput {
  title?: string;
  category?: string;
  estimatedMinutes?: number;
  plannedDate?: LocalDate;
  courseId?: number | null;
  deliverableId?: number | null;
  /** ISO instant, or null to un-timebox. Undefined leaves it alone -- same
   *  set/clear/leave-alone convention as MitTimebox (submitCheckin.ts). Never touches
   *  status/completed_at/mit_rank -- those have their own dedicated setters
   *  (updateTaskStatus, the morning check-in's MIT selection). */
  plannedStartAt?: string | null;
  plannedLocation?: string | null;
}

export async function updateTask(
  client: TypedSupabaseClient,
  userId: string,
  taskId: number,
  input: UpdateTaskInput,
): Promise<DataResult<Task>> {
  const { data, error } = await client
    .from('tasks')
    .update({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.estimatedMinutes !== undefined ? { estimated_minutes: input.estimatedMinutes } : {}),
      ...(input.plannedDate !== undefined ? { planned_date: input.plannedDate } : {}),
      ...(input.courseId !== undefined ? { course_id: input.courseId } : {}),
      ...(input.deliverableId !== undefined ? { deliverable_id: input.deliverableId } : {}),
      ...(input.plannedStartAt !== undefined ? { planned_start_at: input.plannedStartAt } : {}),
      ...(input.plannedLocation !== undefined ? { planned_location: input.plannedLocation } : {}),
    })
    .eq('id', taskId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Hard delete, not a status flip -- unlike updateTaskStatus's 'cancelled', a delete is
 *  for a task that was never real (entered by mistake), not one that was real and then
 *  abandoned. task_sessions.task_id is ON DELETE CASCADE (migration 0005): deleting a
 *  task deletes its real focus-session history too, not just the task label -- the
 *  schema's own decision, not this function's. Refuses to no-op on a row that doesn't
 *  exist or isn't the caller's, same standard as deleteDeliverable. */
export async function deleteTask(
  client: TypedSupabaseClient,
  userId: string,
  taskId: number,
): Promise<DataResult<null>> {
  const { data, error } = await client.from('tasks').delete().eq('id', taskId).eq('user_id', userId).select('id').maybeSingle();
  if (error) return dataErr(mapDataError(error));
  if (!data) return dataErr({ code: 'not_found', message: 'That task could not be found.' });
  return dataOk(null);
}
