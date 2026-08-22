import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type Deliverable = Database['public']['Tables']['deliverables']['Row'];
export type DeliverableType = Database['public']['Enums']['deliverable_type'];
export type DeliverableStatus = Deliverable['status'];

export interface CreateDeliverableInput {
  courseId: number;
  title: string;
  type: DeliverableType;
  /** ISO instant. */
  dueAt: string;
  estimatedMinutes?: number;
  /** Links this deliverable to an already-existing grade_items row for weighted-grade
   *  tracking. Optional -- a manually-entered assignment is real and schedulable before
   *  the user has decided (or the syllabus has said) how it's graded. */
  gradeItemId?: number;
}

/** L12A/E1: manual assignment entry, the highest-leverage gap in the audit -- grade
 *  weighting and backplan generation both hang off deliverables existing at all.
 *  local_due_date is left as a required-placeholder value: migration 0004's
 *  deliverables_sync_local_due_date trigger unconditionally overwrites it from
 *  due_at + the user's profile timezone on every insert, same pattern as
 *  decisionJournal.ts/killEvents.ts's occurred_at-derived local_date columns. */
export async function createDeliverable(
  client: TypedSupabaseClient,
  userId: string,
  input: CreateDeliverableInput,
): Promise<DataResult<Deliverable>> {
  const { data, error } = await client
    .from('deliverables')
    .insert({
      user_id: userId,
      course_id: input.courseId,
      title: input.title,
      type: input.type,
      due_at: input.dueAt,
      local_due_date: '1970-01-01',
      ...(input.estimatedMinutes != null ? { estimated_minutes: input.estimatedMinutes } : {}),
      ...(input.gradeItemId != null ? { grade_item_id: input.gradeItemId } : {}),
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export interface UpdateDeliverableInput {
  title?: string;
  type?: DeliverableType;
  /** ISO instant. The sync trigger recomputes local_due_date whenever this changes. */
  dueAt?: string;
  estimatedMinutes?: number | null;
  status?: DeliverableStatus;
  /** null explicitly unlinks from its grade item; undefined leaves it alone -- same
   *  set/clear/leave-alone convention as MitTimebox (submitCheckin.ts). */
  gradeItemId?: number | null;
}

export async function updateDeliverable(
  client: TypedSupabaseClient,
  userId: string,
  deliverableId: number,
  input: UpdateDeliverableInput,
): Promise<DataResult<Deliverable>> {
  const { data, error } = await client
    .from('deliverables')
    .update({
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.dueAt !== undefined ? { due_at: input.dueAt } : {}),
      ...(input.estimatedMinutes !== undefined ? { estimated_minutes: input.estimatedMinutes } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.gradeItemId !== undefined ? { grade_item_id: input.gradeItemId } : {}),
    })
    .eq('id', deliverableId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Hard delete, not a status flip -- deliverables.status has no 'cancelled'/'deleted'
 *  value in its check constraint (migration 0004), unlike tasks. Cascades to
 *  deliverable_backplans/backplan_milestones (ON DELETE CASCADE); linked tasks are
 *  detached, not deleted (tasks.deliverable_id is ON DELETE SET NULL). Refuses silently
 *  succeeding on a row that was never there or wasn't the caller's -- same "not a silent
 *  no-op" standard as focusSessions.ts's double-complete guard. */
export async function deleteDeliverable(
  client: TypedSupabaseClient,
  userId: string,
  deliverableId: number,
): Promise<DataResult<null>> {
  const { data, error } = await client
    .from('deliverables')
    .delete()
    .eq('id', deliverableId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  if (!data) return dataErr({ code: 'not_found', message: 'That assignment could not be found.' });
  return dataOk(null);
}

/** Raw deliverables rows for one course, ordered soonest-due-first -- for rendering an
 *  assignments table (due_at, type, status). DeliverableRisk (day/risk.ts) only carries
 *  title + courseId, which is enough to score risk but not enough to render a list. */
export async function listDeliverables(
  client: TypedSupabaseClient,
  courseId: number,
): Promise<DataResult<Deliverable[]>> {
  const { data, error } = await client.from('deliverables').select('*').eq('course_id', courseId).order('due_at');
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
