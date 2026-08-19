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
