import {
  createQuestion,
  getOwnProfile,
  getUserLocalToday,
  loadQuestionBank,
  listQuestionsForCourse,
  recordAttempt,
  retireQuestion,
  type CreateQuestionInput,
  type QuestionBankState,
  type QuestionRow,
} from "@collegeos/api";
import type { RetrievalConfidence } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

export interface BankActionResult {
  ok: boolean;
  error?: string;
}

export async function loadBank(
  userId: string,
): Promise<{ ok: true; data: QuestionBankState } | { ok: false; error: string }> {
  const client = getMobileSupabaseClient();
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const today = getUserLocalToday(profileResult.data.timezone, new Date());
  const result = await loadQuestionBank(client, userId, today, profileResult.data.timezone);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export async function loadCourseQuestions(
  userId: string,
  courseId: number,
): Promise<{ ok: true; data: QuestionRow[] } | { ok: false; error: string }> {
  const result = await listQuestionsForCourse(getMobileSupabaseClient(), userId, courseId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export async function addQuestion(userId: string, input: CreateQuestionInput): Promise<BankActionResult> {
  const result = await createQuestion(getMobileSupabaseClient(), userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

export async function retireQuestionAction(userId: string, questionId: number): Promise<BankActionResult> {
  const result = await retireQuestion(getMobileSupabaseClient(), userId, questionId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}

/** One drill answer: the calibration tap happened BEFORE reveal; the verdict after. */
export async function answerQuestion(
  userId: string,
  questionId: number,
  confidence: RetrievalConfidence,
  correct: boolean,
): Promise<BankActionResult> {
  const client = getMobileSupabaseClient();
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const localDate = getUserLocalToday(profileResult.data.timezone, new Date());
  const result = await recordAttempt(client, userId, { questionId, localDate, confidence, correct });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true };
}
