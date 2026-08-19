import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type SemesterLessonRow = Database['public']['Tables']['semester_lessons']['Row'];
export type InsightConfidenceLevel = Database['public']['Enums']['insight_confidence_level'];

export interface CreateSemesterLessonInput {
  term: string;
  lesson: string;
  confidence?: InsightConfidenceLevel;
  sourceReportId?: number;
  /** The insight this lesson was promoted from -- SCREEN_SPEC §6: "a claim without
   *  evidence is not displayed." Null for manually-written lessons; every
   *  retrospective-promoted lesson must set this so loadDurableProfile can dedupe
   *  re-confirmations across retrospective runs instead of repeating the same lesson in
   *  every future nightly call's cached context. */
  sourceInsightId?: number;
}

/** Durable lessons carried forward across terms -- the summary pyramid's highest tier
 *  (LLM_LAYER_SPEC.md §5), append-only by design (`semester_lessons` has no
 *  update/delete RLS policy, DATA_MODEL.md §5) -- a lesson is superseded by a new row,
 *  never edited in place, so the history of what CollegeOS believed and when survives. */
export async function createSemesterLesson(
  client: TypedSupabaseClient,
  userId: string,
  input: CreateSemesterLessonInput,
): Promise<DataResult<SemesterLessonRow>> {
  const { data, error } = await client
    .from('semester_lessons')
    .insert({
      user_id: userId,
      term: input.term,
      lesson: input.lesson,
      confidence: input.confidence ?? 'testing',
      source_report_id: input.sourceReportId ?? null,
      source_insight_id: input.sourceInsightId ?? null,
    })
    .select()
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** All lessons ever recorded, most recent first -- this is what feeds the nightly
 *  context envelope's durable profile (closes the exact gap flagged in
 *  buildContext.ts's DurableProfile comment: "durable lessons... nothing to source
 *  them from yet"). Not scoped to one term by default, since a lesson from a prior
 *  semester is exactly the kind of thing that should still inform this one. */
export async function listSemesterLessons(client: TypedSupabaseClient): Promise<DataResult<SemesterLessonRow[]>> {
  const { data, error } = await client.from('semester_lessons').select('*').order('created_at', { ascending: false });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function listSemesterLessonsForTerm(client: TypedSupabaseClient, term: string): Promise<DataResult<SemesterLessonRow[]>> {
  const { data, error } = await client.from('semester_lessons').select('*').eq('term', term).order('created_at', { ascending: false });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
