import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type PracticeTestRow = Database['public']['Tables']['practice_tests']['Row'];

/** Practice-test log (migration 44) -- score only; the missed items become Bank
 *  questions (origin='missed') through createQuestion, never a second question store. */

export interface LogPracticeTestInput {
  courseId: number;
  deliverableId?: number;
  localDate: string;
  scorePct: number;
  timed: boolean;
  conditions?: string;
}

export async function logPracticeTest(
  client: TypedSupabaseClient,
  userId: string,
  input: LogPracticeTestInput,
): Promise<DataResult<PracticeTestRow>> {
  if (!(input.scorePct >= 0 && input.scorePct <= 100)) {
    return dataErr({ code: 'validation', message: 'Score must be between 0 and 100.' });
  }
  const { data, error } = await client
    .from('practice_tests')
    .insert({
      user_id: userId,
      course_id: input.courseId,
      ...(input.deliverableId != null ? { deliverable_id: input.deliverableId } : {}),
      local_date: input.localDate,
      score_pct: input.scorePct,
      timed: input.timed,
      ...(input.conditions != null && input.conditions.trim() !== '' ? { conditions: input.conditions.trim() } : {}),
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function listPracticeTestsForDeliverable(
  client: TypedSupabaseClient,
  userId: string,
  deliverableId: number,
): Promise<DataResult<PracticeTestRow[]>> {
  const { data, error } = await client
    .from('practice_tests')
    .select('*')
    .eq('user_id', userId)
    .eq('deliverable_id', deliverableId)
    .order('local_date', { ascending: true });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

/** The real score for a deliverable's linked grade item, as a percentage -- the
 *  benchmark rule's other input. Null when no grade item is linked or nothing is
 *  entered yet (absent, never fabricated). */
export async function getDeliverableRealScorePct(
  client: TypedSupabaseClient,
  userId: string,
  gradeItemId: number,
): Promise<DataResult<number | null>> {
  const { data, error } = await client
    .from('grade_items')
    .select('points_earned, points_possible')
    .eq('user_id', userId)
    .eq('id', gradeItemId)
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  if (data == null || data.points_earned == null) return dataOk(null);
  return dataOk((Number(data.points_earned) / Number(data.points_possible)) * 100);
}
