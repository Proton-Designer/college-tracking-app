import "server-only";
import {
  completionPctFromDraft,
  getNightReviewDraft,
  getPredictionForDate,
  getReviewForDate,
  getUserLocalToday,
  listTasksForDate,
  loadScreenTimeStep,
  loadVisionChain,
  type DailyPredictionRow,
  type DailyReview,
  type NightReviewDraft,
  type ScreenTimeStepView,
  type Task,
} from "@collegeos/api";
import { startOfWeek } from "@collegeos/core";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface ReviewData {
  userId: string;
  today: string;
  /** Today's MITs that didn't get completed — the friction log is scoped to these,
   *  matching the check-in's own "Top 3" scoping rather than every task of the day. */
  incompleteMits: Task[];
  /** Non-null if a review for today was already submitted — the form becomes read-only
   *  in that case rather than silently overwriting (submitNightReview upserts, so a
   *  second submit *would* succeed, but re-showing a blank form after a real submission
   *  reads as data loss even though nothing was actually lost). */
  existingReview: DailyReview | null;
  /** Auto-populated actuals — computed server-side, never trusted from the client, and
   *  the identical computation submitNightReview persists. */
  draft: NightReviewDraft;
  /** Same ratio submitNightReview will score against; read here rather than re-derived
   *  in the component so the UI never computes a domain value. */
  draftCompletionPct: number;
  /** This morning's completion prediction for today, if one was made. Null is a real
   *  state (check-in was skipped), not a loading gap. */
  prediction: DailyPredictionRow | null;
  /** True when the active M.O.M.'s ninety days are up and no review has been written for it
   *  (D48). The link to that ritual appears only then -- a permanent entry point to a quarterly
   *  ceremony is how a ceremony becomes furniture. */
  momReviewDue: boolean;
  /** The week's screen-time step (D51) — the invitation, any staged reading, and the confirmed
   *  series. Null when the read failed: the step drops rather than blanking the review, the same
   *  degradation `momReviewDue` takes. */
  screenTime: ScreenTimeStepView | null;
}

export type ReviewLoadResult = { ok: true; data: ReviewData } | { ok: false; error: string };

export async function loadReviewData(): Promise<ReviewLoadResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const profileResult = await client.from("profiles").select("timezone").eq("id", user.id).single();
  if (profileResult.error) return { ok: false, error: profileResult.error.message };

  const today = getUserLocalToday(profileResult.data.timezone, new Date());

  // The Sunday-anchored week the user is standing in, from their own timezone — never UTC's (B4).
  const weekStart = startOfWeek(today);

  const [tasksResult, reviewResult, draftResult, predictionResult, chainResult, screenTimeResult] =
    await Promise.all([
      listTasksForDate(client, today),
      getReviewForDate(client, today),
      getNightReviewDraft(client, user.id, today),
      getPredictionForDate(client, user.id, today),
      loadVisionChain(client, user.id, { today }),
      loadScreenTimeStep(client, user.id, weekStart),
    ]);
  if (!tasksResult.ok) return { ok: false, error: tasksResult.error.message };
  if (!reviewResult.ok) return { ok: false, error: reviewResult.error.message };
  if (!draftResult.ok) return { ok: false, error: draftResult.error.message };
  if (!predictionResult.ok) return { ok: false, error: predictionResult.error.message };

  const incompleteMits = tasksResult.data.filter((t) => t.mit_rank != null && t.status !== "completed");

  return {
    ok: true,
    data: {
      userId: user.id,
      today,
      incompleteMits,
      existingReview: reviewResult.data,
      draft: draftResult.data,
      draftCompletionPct: completionPctFromDraft(draftResult.data),
      prediction: predictionResult.data,
      // A failed chain read degrades to "not due" rather than to an error: tonight's review must
      // not be blocked by a quarterly ritual's query, and a missing link is a smaller failure
      // than a blank page.
      momReviewDue: chainResult.ok && chainResult.data.reviewDue,
      screenTime: screenTimeResult.ok ? screenTimeResult.data : null,
    },
  };
}
