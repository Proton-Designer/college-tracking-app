import {
  completeLearnSession,
  countDue,
  getOwnProfile,
  getUserLocalToday,
  loadDailySession,
  loadLibrary,
  recordReview,
  startLearnSession,
  type DailySessionView,
  type SourceLibraryEntry,
} from "@collegeos/api";
import type { LessonRating } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

export type LearnResult<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Learn's mobile write paths. Same functions the web actions call, so the two platforms cannot
 * disagree about a schedule — only about how a card looks.
 *
 * Every path resolves the local day from the user's own profile timezone. A review logged at
 * 11:40pm belongs to the day being lived (B4); a device-derived date would file a late-night
 * session on tomorrow and quietly break both the per-day session binary and the comeback
 * detection that reads it.
 */
async function context(userId: string) {
  const client = getMobileSupabaseClient();
  const profile = await getOwnProfile(client);
  if (!profile.ok) return { ok: false as const, error: profile.error.message };
  return {
    ok: true as const,
    client,
    userId,
    today: getUserLocalToday(profile.data.timezone, new Date()),
    newLimit: profile.data.daily_new_lesson_limit,
    desiredRetention: Number(profile.data.desired_retention),
  };
}

export async function loadLearn(userId: string): Promise<LearnResult<DailySessionView>> {
  const ctx = await context(userId);
  if (!ctx.ok) return ctx;

  const result = await loadDailySession(ctx.client, userId, {
    today: ctx.today,
    newLimit: ctx.newLimit,
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}

export async function beginSession(
  userId: string,
): Promise<LearnResult<{ sessionId: number; dueBefore: number }>> {
  const ctx = await context(userId);
  if (!ctx.ok) return ctx;

  // Captured before anything is reviewed: it is one half of D29's comeback test, and it stops
  // existing the moment the queue starts clearing.
  const due = await countDue(ctx.client, userId);
  if (!due.ok) return { ok: false, error: due.error.message };

  const session = await startLearnSession(ctx.client, userId, ctx.today);
  if (!session.ok) return { ok: false, error: session.error.message };

  return { ok: true, data: { sessionId: session.data.id, dueBefore: due.data } };
}

export async function submitReview(
  userId: string,
  input: {
    cardId: number;
    rating: LessonRating;
    sessionId?: number;
    elapsedMs?: number;
    answeredText?: string;
  },
): Promise<LearnResult<true>> {
  const ctx = await context(userId);
  if (!ctx.ok) return ctx;

  const result = await recordReview(ctx.client, userId, {
    cardId: input.cardId,
    rating: input.rating,
    localDate: ctx.today,
    desiredRetention: ctx.desiredRetention,
    ...(input.sessionId != null ? { sessionId: input.sessionId } : {}),
    ...(input.elapsedMs != null ? { elapsedMs: input.elapsedMs } : {}),
    ...(input.answeredText != null && input.answeredText.trim().length > 0
      ? { answeredText: input.answeredText.trim() }
      : {}),
  });
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: true };
}

export async function finishSession(
  userId: string,
  input: {
    sessionId: number;
    cardsReviewed: number;
    newLessonsIntroduced: number;
    dueBeforeSession: number;
  },
): Promise<LearnResult<{ justRecovered: boolean; daysAway: number | null; waiting: number }>> {
  const ctx = await context(userId);
  if (!ctx.ok) return ctx;

  const result = await completeLearnSession(ctx.client, userId, {
    sessionId: input.sessionId,
    today: ctx.today,
    cardsReviewed: input.cardsReviewed,
    newLessonsIntroduced: input.newLessonsIntroduced,
    dueBeforeSession: input.dueBeforeSession,
  });
  if (!result.ok) return { ok: false, error: result.error.message };

  return {
    ok: true,
    data: {
      justRecovered: result.data.comeback.justRecovered,
      daysAway: result.data.comeback.daysAway,
      waiting: result.data.comeback.waiting,
    },
  };
}

export async function loadSources(userId: string): Promise<LearnResult<SourceLibraryEntry[]>> {
  const ctx = await context(userId);
  if (!ctx.ok) return ctx;

  const result = await loadLibrary(ctx.client, userId);
  if (!result.ok) return { ok: false, error: result.error.message };
  return { ok: true, data: result.data };
}
