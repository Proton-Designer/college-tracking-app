"use server";

import {
  completeLearnSession,
  countDue,
  getOwnProfile,
  getUserLocalToday,
  recordReview,
  startLearnSession,
} from "@collegeos/api";
import type { LessonRating } from "@collegeos/core";
import { revalidatePath } from "next/cache";
import { getServerSupabaseClient } from "@/lib/supabase/server";

async function requireUser() {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false as const, error: "Not signed in." };
  return { ok: true as const, client, userId: user.id };
}

export type LearnActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Learn's write paths.
 *
 * Every one of them resolves the local day from the user's own profile timezone rather than from
 * the browser. A review logged at 11:40pm belongs to the day the user is living in (B4), and a
 * client-side date would put a late-night session on tomorrow — which would quietly break both the
 * per-day session binary and the comeback detection that reads it.
 */

async function localToday() {
  const caller = await requireUser();
  if (!caller.ok) return { ok: false as const, error: caller.error };
  const profile = await getOwnProfile(caller.client);
  if (!profile.ok) return { ok: false as const, error: profile.error.message };
  return {
    ok: true as const,
    caller,
    today: getUserLocalToday(profile.data.timezone, new Date()),
    desiredRetention: Number(profile.data.desired_retention),
  };
}

export async function startSessionAction(): Promise<LearnActionResult<{ sessionId: number; dueBefore: number }>> {
  const ctx = await localToday();
  if (!ctx.ok) return { ok: false, error: "error" in ctx ? ctx.error : "Not signed in." };

  // The due count is captured BEFORE any review lands, because it is one half of D29's comeback
  // test and it stops existing the moment the session starts clearing the queue.
  const due = await countDue(ctx.caller.client, ctx.caller.userId, ctx.desiredRetention);
  if (!due.ok) return { ok: false, error: due.error.message };

  const session = await startLearnSession(ctx.caller.client, ctx.caller.userId, ctx.today);
  if (!session.ok) return { ok: false, error: session.error.message };

  return { ok: true, data: { sessionId: session.data.id, dueBefore: due.data } };
}

export async function recordReviewAction(input: {
  cardId: number;
  rating: LessonRating;
  sessionId?: number;
  elapsedMs?: number;
  answeredText?: string;
}): Promise<LearnActionResult<true>> {
  const ctx = await localToday();
  if (!ctx.ok) return { ok: false, error: "error" in ctx ? ctx.error : "Not signed in." };

  const result = await recordReview(ctx.caller.client, ctx.caller.userId, {
    cardId: input.cardId,
    rating: input.rating,
    localDate: ctx.today,
    ...(input.sessionId != null ? { sessionId: input.sessionId } : {}),
    ...(input.elapsedMs != null ? { elapsedMs: input.elapsedMs } : {}),
    // Stored because the generation effect depends on the attempt having existed. Treated as the
    // user's own words about their own learning: never logged, never sent anywhere beyond the
    // grading call the user asked for.
    ...(input.answeredText != null && input.answeredText.trim().length > 0
      ? { answeredText: input.answeredText.trim() }
      : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: true };
}

export async function completeSessionAction(input: {
  sessionId: number;
  cardsReviewed: number;
  newLessonsIntroduced: number;
  dueBeforeSession: number;
}): Promise<
  LearnActionResult<{ justRecovered: boolean; daysAway: number | null; waiting: number }>
> {
  const ctx = await localToday();
  if (!ctx.ok) return { ok: false, error: "error" in ctx ? ctx.error : "Not signed in." };

  const result = await completeLearnSession(ctx.caller.client, ctx.caller.userId, {
    sessionId: input.sessionId,
    today: ctx.today,
    cardsReviewed: input.cardsReviewed,
    newLessonsIntroduced: input.newLessonsIntroduced,
    dueBeforeSession: input.dueBeforeSession,
    desiredRetention: ctx.desiredRetention,
  });
  if (!result.ok) return { ok: false, error: result.error.message };

  revalidatePath("/learn");
  return {
    ok: true,
    data: {
      justRecovered: result.data.comeback.justRecovered,
      daysAway: result.data.comeback.daysAway,
      waiting: result.data.comeback.waiting,
    },
  };
}
