"use server";

import { revalidatePath } from "next/cache";
import { createCourse, type CourseInsert } from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

async function requireUserId(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };
  return { ok: true, userId: user.id };
}

export interface CreateCourseInput {
  code: string;
  name: string;
  term: string;
}

export type CreateCourseActionResult = { ok: true; courseId: number } | { ok: false; error: string };

export async function createCourseAction(input: CreateCourseInput): Promise<CreateCourseActionResult> {
  const caller = await requireUserId();
  if (!caller.ok) return caller;
  const client = await getServerSupabaseClient();
  const insert: CourseInsert = { user_id: caller.userId, code: input.code, name: input.name, term: input.term };
  const result = await createCourse(client, insert);
  if (!result.ok) return { ok: false, error: result.error.message };
  revalidatePath("/courses");
  return { ok: true, courseId: result.data.id };
}
