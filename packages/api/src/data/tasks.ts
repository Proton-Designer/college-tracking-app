import type { LocalDate } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type Task = Database['public']['Tables']['tasks']['Row'];
export type TaskInsert = Database['public']['Tables']['tasks']['Insert'];
export type TaskStatus = Task['status'];
/** Migration 0005's own check constraint -- not a real Postgres enum, so the generated
 *  types don't carry this union; declared by hand here to match it exactly. */
export type TaskProofOfWorkType = 'confirmation_attachment' | 'practice_question_count' | 'git_commit' | 'summary_text' | 'whoop_workout';

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

/** Every task linked to one deliverable, oldest-planned-first -- /deliverables/[id]'s
 *  own "tasks under this assignment" list. */
export async function listTasksForDeliverable(
  client: TypedSupabaseClient,
  deliverableId: number,
): Promise<DataResult<Task[]>> {
  const { data, error } = await client.from('tasks').select('*').eq('deliverable_id', deliverableId).order('planned_date');
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
  /** Migration 0005's own constraint: requires_proof_of_work=true requires a non-null
   *  proofOfWorkType. Checked here too for a real error message rather than a raw
   *  constraint violation -- same reasoning as gradeStructure.ts's weight-budget check.
   *  Turning proof-of-work OFF (requiresProofOfWork: false) also clears the type and
   *  any content already submitted, so a task can't be left claiming a since-removed
   *  requirement was satisfied by evidence for a requirement that no longer exists. */
  requiresProofOfWork?: boolean;
  proofOfWorkType?: TaskProofOfWorkType | null;
}

export async function updateTask(
  client: TypedSupabaseClient,
  userId: string,
  taskId: number,
  input: UpdateTaskInput,
): Promise<DataResult<Task>> {
  if (input.requiresProofOfWork === true && input.proofOfWorkType == null) {
    return dataErr({ code: 'validation', message: 'Pick what kind of proof this task requires.' });
  }

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
      ...(input.requiresProofOfWork !== undefined ? { requires_proof_of_work: input.requiresProofOfWork } : {}),
      ...(input.requiresProofOfWork === false ? { proof_of_work_type: null, proof_of_work_content: null } : {}),
      ...(input.requiresProofOfWork !== false && input.proofOfWorkType !== undefined ? { proof_of_work_type: input.proofOfWorkType } : {}),
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
