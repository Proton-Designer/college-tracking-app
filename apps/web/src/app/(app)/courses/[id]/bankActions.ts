"use server";

import {
  createQuestion,
  draftQuestionsFromNotes,
  listQuestionsForCourse,
  retireQuestion,
  type CreateQuestionInput,
  type DraftOutcome,
  type QuestionRow,
} from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/** Same server-action shape as announcementActions.ts: thin auth + passthrough to the
 *  shared data layer, so a web-written question is indistinguishable from a phone's. */

export interface BankActionResult<T> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function requireUserId(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  return { ok: true, userId: user.id };
}

export async function listCourseQuestionsAction(
  courseId: number,
): Promise<BankActionResult<QuestionRow[]>> {
  const auth = await requireUserId();
  if (!auth.ok) return { ok: false, error: auth.error };
  const client = await getServerSupabaseClient();
  const result = await listQuestionsForCourse(client, auth.userId, courseId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export async function addQuestionAction(
  input: CreateQuestionInput,
): Promise<BankActionResult<QuestionRow>> {
  const auth = await requireUserId();
  if (!auth.ok) return { ok: false, error: auth.error };
  const client = await getServerSupabaseClient();
  const result = await createQuestion(client, auth.userId, input);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export async function retireQuestionAction(
  questionId: number,
): Promise<BankActionResult<QuestionRow>> {
  const auth = await requireUserId();
  if (!auth.ok) return { ok: false, error: auth.error };
  const client = await getServerSupabaseClient();
  const result = await retireQuestion(client, auth.userId, questionId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export async function draftFromNotesAction(
  notesText: string,
): Promise<BankActionResult<DraftOutcome>> {
  const auth = await requireUserId();
  if (!auth.ok) return { ok: false, error: auth.error };
  const client = await getServerSupabaseClient();
  const result = await draftQuestionsFromNotes(client, notesText);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}
