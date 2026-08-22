import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type CourseOfficeHourRow = Database['public']['Tables']['course_office_hours']['Row'];

export interface CreateOfficeHourInput {
  courseId: number;
  /** 0 = Sunday … 6 = Saturday, matching Postgres `extract(dow)` and JS `getDay()`. */
  dayOfWeek: number;
  /** Local wall-clock `HH:MM`, never an instant. Office hours recur weekly and belong to a
   *  campus timetable, not to a moment — storing them as timestamps would force a date they
   *  do not have and would drift across DST. Same reasoning as `TimePicker`'s emitted shape. */
  startTime: string;
  endTime: string;
  location?: string;
}

/**
 * U5 — office hours. The table (`course_office_hours`) has existed since the academic
 * schema and carries real seeded data, and **no function anywhere in the repo read or wrote
 * it**, so nothing could ever display it. This is that missing layer.
 *
 * `SCREEN_SPEC` §4 additionally wants office hours surfaced *contextually*, when a topic has
 * been repeatedly flagged confusing — the brief's "better intervention than explaining the
 * concept a tenth time." That part is deliberately NOT implemented here: "repeatedly" needs a
 * real threshold, and inventing one would be exactly the fabricated-constant failure this
 * build has spent its time removing. Displaying them as reference data on course detail is
 * honest and useful on its own; the contextual trigger waits for a rule from the domain spec.
 */
export async function listCourseOfficeHours(
  client: TypedSupabaseClient,
  courseId: number,
): Promise<DataResult<CourseOfficeHourRow[]>> {
  const { data, error } = await client
    .from('course_office_hours')
    .select('*')
    .eq('course_id', courseId)
    .order('day_of_week')
    .order('start_time');
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function createOfficeHour(
  client: TypedSupabaseClient,
  userId: string,
  input: CreateOfficeHourInput,
): Promise<DataResult<CourseOfficeHourRow>> {
  if (input.dayOfWeek < 0 || input.dayOfWeek > 6) {
    return dataErr({ code: 'validation', message: 'dayOfWeek must be 0 (Sunday) through 6 (Saturday).' });
  }
  if (input.endTime <= input.startTime) {
    return dataErr({ code: 'validation', message: 'Office hours must end after they start.' });
  }

  const { data, error } = await client
    .from('course_office_hours')
    .insert({
      user_id: userId,
      course_id: input.courseId,
      day_of_week: input.dayOfWeek,
      start_time: input.startTime,
      end_time: input.endTime,
      location: input.location ?? null,
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function deleteOfficeHour(
  client: TypedSupabaseClient,
  userId: string,
  officeHourId: number,
): Promise<DataResult<null>> {
  // Scoped by user_id as well as id: RLS is the backstop, not the only guard (D18).
  const { error } = await client.from('course_office_hours').delete().eq('id', officeHourId).eq('user_id', userId);
  if (error) return dataErr(mapDataError(error));
  return dataOk(null);
}
