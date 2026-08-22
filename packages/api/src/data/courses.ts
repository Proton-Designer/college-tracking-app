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
