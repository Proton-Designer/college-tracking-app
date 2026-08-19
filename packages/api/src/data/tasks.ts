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
