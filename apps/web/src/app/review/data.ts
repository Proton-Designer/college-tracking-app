import "server-only";
import { getReviewForDate, getUserLocalToday, listTasksForDate, type DailyReview, type Task } from "@collegeos/api";
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

  const [tasksResult, reviewResult] = await Promise.all([listTasksForDate(client, today), getReviewForDate(client, today)]);
  if (!tasksResult.ok) return { ok: false, error: tasksResult.error.message };
  if (!reviewResult.ok) return { ok: false, error: reviewResult.error.message };

  const incompleteMits = tasksResult.data.filter((t) => t.mit_rank != null && t.status !== "completed");

  return {
    ok: true,
    data: { userId: user.id, today, incompleteMits, existingReview: reviewResult.data },
  };
}
