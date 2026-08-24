import { getOwnProfile, getUserLocalToday, loadWeekReviewData } from "@collegeos/api";
import { addDays, computeWeekReview, type WeekReview } from "@collegeos/core";
import { getMobileSupabaseClient } from "./supabase/client";

export interface WeekReviewState {
  fromDate: string;
  toDate: string;
  review: WeekReview;
}

/**
 * The trailing seven local days, ending today. A rolling window rather than
 * Monday-anchored: the review is opened when the user opens it (the blueprint says
 * Sunday, life says whenever), and a rolling week means it is never empty on a Tuesday.
 */
export async function loadWeekReview(
  userId: string,
): Promise<{ ok: true; data: WeekReviewState } | { ok: false; error: string }> {
  const client = getMobileSupabaseClient();
  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) return { ok: false, error: profileResult.error.message };
  const toDate = getUserLocalToday(profileResult.data.timezone, new Date());
  const fromDate = addDays(toDate, -6);

  const data = await loadWeekReviewData(client, userId, fromDate, toDate);
  if (!data.ok) return { ok: false, error: data.error.message };

  return {
    ok: true,
    data: { fromDate, toDate, review: computeWeekReview(data.data.hourRows, data.data.causes, data.data.dayFacts) },
  };
}
