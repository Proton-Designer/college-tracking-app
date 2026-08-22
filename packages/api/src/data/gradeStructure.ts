import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type GradeCategoryRow = Database['public']['Tables']['grade_categories']['Row'];
export type GradeItemRow = Database['public']['Tables']['grade_items']['Row'];
export type GradeBoundaryRow = Database['public']['Tables']['grade_boundaries']['Row'];

/** Raw grade_categories rows for one course -- for rendering a categories/weights table,
 *  not for computation (computation goes through packages/core via gradeScenario.ts). */
export async function listGradeCategories(
  client: TypedSupabaseClient,
  courseId: number,
): Promise<DataResult<GradeCategoryRow[]>> {
  const { data, error } = await client.from('grade_categories').select('*').eq('course_id', courseId).order('name');
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Raw grade_items rows for one course. */
export async function listGradeItems(
  client: TypedSupabaseClient,
  courseId: number,
): Promise<DataResult<GradeItemRow[]>> {
  const { data, error } = await client.from('grade_items').select('*').eq('course_id', courseId).order('name');
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Raw grade_boundaries rows for one course (letter -> min_pct), for rendering what each
 *  letter grade actually requires -- e.g. Courses detail's "B+ starts at 87%" readout. */
export async function listGradeBoundaries(
  client: TypedSupabaseClient,
  courseId: number,
): Promise<DataResult<GradeBoundaryRow[]>> {
  const { data, error } = await client
    .from('grade_boundaries')
    .select('*')
    .eq('course_id', courseId)
    .order('min_pct', { ascending: false });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export interface CreateGradeCategoryInput {
  courseId: number;
  name: string;
  weightPct: number;
  dropLowestN?: number;
  expectedItemCount?: number;
}

/** Categories are legitimately allowed to sum to LESS than 100 -- a syllabus entered
 *  incrementally, or a category not yet announced, is a real, incomplete-but-honest
 *  state (courseGrade.ts's own weightSumWarning already surfaces this passively rather
 *  than blocking it). Summing to MORE than 100 is never legitimate, though -- that's not
 *  an in-progress state, it's a data-entry error, and unlike "not yet 100" it can be
 *  caught unambiguously at write time. Server-side because a client-only check is
 *  advisory, same reasoning syllabus-confirm's weight/re-validation gate is built on. */
const WEIGHT_SUM_TOLERANCE_PCT = 1e-6;

async function assertWeightWithinBudget(
  client: TypedSupabaseClient,
  courseId: number,
  userId: string,
  newWeightPct: number,
  excludeCategoryId?: number,
): Promise<{ code: 'validation'; message: string } | null> {
  let query = client.from('grade_categories').select('id, weight_pct').eq('course_id', courseId).eq('user_id', userId);
  if (excludeCategoryId != null) query = query.neq('id', excludeCategoryId);
  const { data: existing, error } = await query;
  if (error) throw error;

  const existingTotal = (existing ?? []).reduce((sum, c) => sum + Number(c.weight_pct), 0);
  const total = existingTotal + newWeightPct;
  if (total > 100 + WEIGHT_SUM_TOLERANCE_PCT) {
    return {
      code: 'validation',
      message: `This category's ${newWeightPct}% would bring the course's category weights to ${Math.round(total * 100) / 100}%, over 100%. Adjust an existing category's weight first.`,
    };
  }
  return null;
}

export async function createGradeCategory(
  client: TypedSupabaseClient,
  userId: string,
  input: CreateGradeCategoryInput,
): Promise<DataResult<GradeCategoryRow>> {
  const budgetError = await assertWeightWithinBudget(client, input.courseId, userId, input.weightPct);
  if (budgetError) return dataErr(budgetError);

  const { data, error } = await client
    .from('grade_categories')
    .insert({
      user_id: userId,
      course_id: input.courseId,
      name: input.name,
      weight_pct: input.weightPct,
      ...(input.dropLowestN != null ? { drop_lowest_n: input.dropLowestN } : {}),
      ...(input.expectedItemCount != null ? { expected_item_count: input.expectedItemCount } : {}),
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export interface UpdateGradeCategoryInput {
  name?: string;
  weightPct?: number;
  dropLowestN?: number;
  expectedItemCount?: number;
}

export async function updateGradeCategory(
  client: TypedSupabaseClient,
  userId: string,
  categoryId: number,
  input: UpdateGradeCategoryInput,
): Promise<DataResult<GradeCategoryRow>> {
  const { data: current, error: currentError } = await client
    .from('grade_categories')
    .select('course_id')
    .eq('id', categoryId)
    .eq('user_id', userId)
    .single();
  if (currentError) return dataErr(mapDataError(currentError));

  if (input.weightPct != null) {
    const budgetError = await assertWeightWithinBudget(client, current.course_id, userId, input.weightPct, categoryId);
    if (budgetError) return dataErr(budgetError);
  }

  const { data, error } = await client
    .from('grade_categories')
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.weightPct !== undefined ? { weight_pct: input.weightPct } : {}),
      ...(input.dropLowestN !== undefined ? { drop_lowest_n: input.dropLowestN } : {}),
      ...(input.expectedItemCount !== undefined ? { expected_item_count: input.expectedItemCount } : {}),
    })
    .eq('id', categoryId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Hard delete. grade_items.category_id is ON DELETE CASCADE (migration 0004) -- deleting
 *  a category deletes every grade item filed under it, not just the category label. That
 *  cascade is the schema's own decision, not something this function chooses; callers
 *  that want to warn a user before losing recorded grades need to check
 *  listGradeItems(courseId) themselves first. */
export async function deleteGradeCategory(
  client: TypedSupabaseClient,
  userId: string,
  categoryId: number,
): Promise<DataResult<null>> {
  const { data, error } = await client
    .from('grade_categories')
    .delete()
    .eq('id', categoryId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  if (!data) return dataErr({ code: 'not_found', message: 'That grade category could not be found.' });
  return dataOk(null);
}

export interface UpsertGradeBoundaryInput {
  courseId: number;
  letter: string;
  minPct: number;
}

/** Upsert on (course_id, letter) -- migration 0004's own unique constraint. A boundary
 *  table is naturally edited by re-declaring a letter's cutoff, not by looking up
 *  whether it already exists first. */
export async function upsertGradeBoundary(
  client: TypedSupabaseClient,
  userId: string,
  input: UpsertGradeBoundaryInput,
): Promise<DataResult<GradeBoundaryRow>> {
  const { data, error } = await client
    .from('grade_boundaries')
    .upsert(
      { user_id: userId, course_id: input.courseId, letter: input.letter, min_pct: input.minPct },
      { onConflict: 'course_id,letter' },
    )
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function deleteGradeBoundary(
  client: TypedSupabaseClient,
  userId: string,
  boundaryId: number,
): Promise<DataResult<null>> {
  const { data, error } = await client
    .from('grade_boundaries')
    .delete()
    .eq('id', boundaryId)
    .eq('user_id', userId)
    .select('id')
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  if (!data) return dataErr({ code: 'not_found', message: 'That grade boundary could not be found.' });
  return dataOk(null);
}
