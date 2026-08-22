import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type Course = Database['public']['Tables']['courses']['Row'];
export type CourseInsert = Database['public']['Tables']['courses']['Insert'];

/** Excludes archived courses by default -- a course whose semester ended shouldn't keep
 *  showing up on the primary Courses list. Pass includeArchived:true for a view that
 *  deliberately wants them (e.g. a future "show archived" toggle). */
export async function listCourses(
  client: TypedSupabaseClient,
  options: { includeArchived?: boolean } = {},
): Promise<DataResult<Course[]>> {
  let query = client.from('courses').select('*').order('code');
  if (!options.includeArchived) query = query.is('archived_at', null);
  const { data, error } = await query;
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function getCourse(client: TypedSupabaseClient, courseId: number): Promise<DataResult<Course>> {
  const { data, error } = await client.from('courses').select('*').eq('id', courseId).single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function createCourse(
  client: TypedSupabaseClient,
  input: CourseInsert,
): Promise<DataResult<Course>> {
  const { data, error } = await client.from('courses').insert(input).select().single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export interface UpdateCourseInput {
  code?: string;
  name?: string;
  professorName?: string | null;
  professorContact?: string | null;
  term?: string;
  color?: string | null;
  difficultyRating?: number | null;
  confidenceRating?: number | null;
  targetGradePct?: number | null;
  latePolicy?: string | null;
  attendancePolicy?: string | null;
  allowedAbsences?: number | null;
  /** Set to archive (a real timestamp), or null to un-archive. Undefined/omitted leaves
   *  the archive state untouched -- same set/clear/leave-alone convention used
   *  throughout this codebase (MitTimebox, killHabits.ts's UpdateKillHabitInput). */
  archivedAt?: string | null;
}

export async function updateCourse(
  client: TypedSupabaseClient,
  userId: string,
  courseId: number,
  input: UpdateCourseInput,
): Promise<DataResult<Course>> {
  const { data, error } = await client
    .from('courses')
    .update({
      ...(input.code !== undefined ? { code: input.code } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.professorName !== undefined ? { professor_name: input.professorName } : {}),
      ...(input.professorContact !== undefined ? { professor_contact: input.professorContact } : {}),
      ...(input.term !== undefined ? { term: input.term } : {}),
      ...(input.color !== undefined ? { color: input.color } : {}),
      ...(input.difficultyRating !== undefined ? { difficulty_rating: input.difficultyRating } : {}),
      ...(input.confidenceRating !== undefined ? { confidence_rating: input.confidenceRating } : {}),
      ...(input.targetGradePct !== undefined ? { target_grade_pct: input.targetGradePct } : {}),
      ...(input.latePolicy !== undefined ? { late_policy: input.latePolicy } : {}),
      ...(input.attendancePolicy !== undefined ? { attendance_policy: input.attendancePolicy } : {}),
      ...(input.allowedAbsences !== undefined ? { allowed_absences: input.allowedAbsences } : {}),
      ...(input.archivedAt !== undefined ? { archived_at: input.archivedAt } : {}),
    })
    .eq('id', courseId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
