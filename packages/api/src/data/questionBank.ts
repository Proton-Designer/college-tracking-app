import type { LocalDate, QueueItem, RetrievalConfidence } from '@collegeos/core';
import {
  buildDueQueue,
  localDateFromInstant,
  computeCourseCalibration,
  weightedTopics,
  type CourseAttempt,
  type CourseCalibration,
  type QueueQuestion,
} from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type QuestionRow = Database['public']['Tables']['questions']['Row'];
export type AttemptRow = Database['public']['Tables']['attempts']['Row'];

/**
 * The Question Bank's data layer. Fetch-and-write only, like habits: scheduler state and
 * calibration are DERIVED in packages/core from the attempts log -- nothing here reads a
 * stored interval, because none exists (migration 42's decision).
 */

export interface CreateQuestionInput {
  courseId: number;
  prompt: string;
  answer: string;
  /** Required-or-explicitly-skipped: exactly one of anchor / skip must be given. */
  sourceAnchor?: string;
  sourceSkipped?: boolean;
  topic?: string;
  /** 'missed' is the practice-test conversion (migration 42 reserved it; S4 uses it). */
  origin?: 'self' | 'ai' | 'missed';
}

export async function createQuestion(
  client: TypedSupabaseClient,
  userId: string,
  input: CreateQuestionInput,
): Promise<DataResult<QuestionRow>> {
  const prompt = input.prompt.trim();
  const answer = input.answer.trim();
  if (prompt.length === 0 || answer.length === 0) {
    return dataErr({ code: 'validation', message: 'A question needs both a prompt and an answer.' });
  }
  const anchor = input.sourceAnchor?.trim();
  // Mirror of the DB CHECK, but with the friendlier message: the constraint is the
  // guarantee, this is the explanation.
  if ((anchor == null || anchor.length === 0) && input.sourceSkipped !== true) {
    return dataErr({
      code: 'validation',
      message: 'Add a source anchor (page, slide, lecture date) or explicitly skip it -- answers get verified against real material.',
    });
  }

  const { data, error } = await client
    .from('questions')
    .insert({
      user_id: userId,
      course_id: input.courseId,
      prompt,
      answer,
      ...(anchor != null && anchor.length > 0 ? { source_anchor: anchor } : { source_skipped: true }),
      ...(input.topic != null && input.topic.trim() !== '' ? { topic: input.topic.trim() } : {}),
      ...(input.origin != null ? { origin: input.origin } : {}),
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function retireQuestion(
  client: TypedSupabaseClient,
  userId: string,
  questionId: number,
): Promise<DataResult<QuestionRow>> {
  const { data, error } = await client
    .from('questions')
    .update({ active: false })
    .eq('id', questionId)
    .eq('user_id', userId)
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function listQuestionsForCourse(
  client: TypedSupabaseClient,
  userId: string,
  courseId: number,
): Promise<DataResult<QuestionRow[]>> {
  const { data, error } = await client
    .from('questions')
    .select('*')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('active', true)
    .order('created_at', { ascending: false });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? []);
}

/** One calibration tap + verdict. Append-only; the scheduler replays from these. */
export async function recordAttempt(
  client: TypedSupabaseClient,
  userId: string,
  input: { questionId: number; localDate: LocalDate; confidence: RetrievalConfidence; correct: boolean },
): Promise<DataResult<AttemptRow>> {
  const { data, error } = await client
    .from('attempts')
    .insert({
      user_id: userId,
      question_id: input.questionId,
      local_date: input.localDate,
      confidence: input.confidence,
      correct: input.correct,
    })
    .select('*')
    .single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export interface DueQueueEntry {
  item: QueueItem;
  question: QuestionRow;
}

export interface QuestionBankState {
  queue: DueQueueEntry[];
  calibration: CourseCalibration[];
  totalActiveQuestions: number;
  /** Course code (e.g. "CS 2110") keyed by id, for labelling calibration and queue rows. */
  courseCodeById: Record<number, string>;
}

/**
 * The whole read side in one call: fetch active questions + all their attempts (two
 * queries, narrow rows -- the derive-on-read scale math from migration 42), then let
 * core build the interleaved queue and the calibration flags.
 */
export async function loadQuestionBank(
  client: TypedSupabaseClient,
  userId: string,
  today: LocalDate,
  timezone: string,
): Promise<DataResult<QuestionBankState>> {
  const { data: questions, error: qError } = await client
    .from('questions')
    .select('*')
    .eq('user_id', userId)
    .eq('active', true);
  if (qError) return dataErr(mapDataError(qError));
  if (questions == null || questions.length === 0) {
    return dataOk({ queue: [], calibration: [], totalActiveQuestions: 0, courseCodeById: {} });
  }

  const { data: attempts, error: aError } = await client
    .from('attempts')
    .select('question_id, local_date, confidence, correct')
    .eq('user_id', userId);
  if (aError) return dataErr(mapDataError(aError));

  const byQuestion = new Map<number, { localDate: string; correct: boolean; confidence: RetrievalConfidence }[]>();
  for (const row of attempts ?? []) {
    const list = byQuestion.get(row.question_id) ?? [];
    list.push({ localDate: row.local_date, correct: row.correct, confidence: row.confidence as RetrievalConfidence });
    byQuestion.set(row.question_id, list);
  }

  const questionById = new Map(questions.map((q) => [q.id, q]));
  const courseByQuestion = new Map(questions.map((q) => [q.id, q.course_id]));
  const topicByQuestion = new Map(questions.map((q) => [q.id, q.topic]));

  const courseAttempts: CourseAttempt[] = (attempts ?? [])
    .filter((row) => courseByQuestion.has(row.question_id))
    .map((row) => ({
      courseId: courseByQuestion.get(row.question_id)!,
      topic: topicByQuestion.get(row.question_id) ?? null,
      localDate: row.local_date,
      correct: row.correct,
      confidence: row.confidence as RetrievalConfidence,
    }));

  const queueInput: QueueQuestion[] = questions.map((q) => ({
    questionId: q.id,
    courseId: q.course_id,
    topic: q.topic,
    // Local calendar day of creation, never a UTC slice -- a question written at 11pm
    // local must be due TODAY, not tomorrow (B4).
    createdDate: localDateFromInstant(new Date(q.created_at), timezone),
    attempts: byQuestion.get(q.id) ?? [],
  }));

  const queue = buildDueQueue(queueInput, today, weightedTopics(courseAttempts, today)).map((item) => ({
    item,
    question: questionById.get(item.questionId)!,
  }));

  // Codes, not ids, on every surface that names a course. Narrow read; RLS scopes it.
  const courseIds = [...new Set(questions.map((q) => q.course_id))];
  const { data: courses, error: cError } = await client
    .from('courses')
    .select('id, code')
    .in('id', courseIds);
  if (cError) return dataErr(mapDataError(cError));
  const courseCodeById = Object.fromEntries((courses ?? []).map((c) => [c.id, c.code]));

  return dataOk({
    queue,
    calibration: computeCourseCalibration(courseAttempts),
    totalActiveQuestions: questions.length,
    courseCodeById,
  });
}
