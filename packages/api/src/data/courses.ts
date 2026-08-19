import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type Course = Database['public']['Tables']['courses']['Row'];
export type CourseInsert = Database['public']['Tables']['courses']['Insert'];

export async function listCourses(client: TypedSupabaseClient): Promise<DataResult<Course[]>> {
  const { data, error } = await client.from('courses').select('*').order('code');
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
