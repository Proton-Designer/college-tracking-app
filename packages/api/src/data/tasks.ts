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
  const { data, error } = await client
    .from('tasks')
    .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
    .eq('id', taskId)
    .select()
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
