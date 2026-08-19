import {
  completionPctFromDraft,
  getNightReviewDraft,
  getOwnProfile,
  getPredictionForDate,
  getReviewForDate,
  getUserLocalToday,
  listTasksForDate,
  type DailyPredictionRow,
  type DailyReview,
  type NightReviewDraft,
  type Task,
} from "@collegeos/api";
import { useCallback, useEffect, useState } from "react";
import { getMobileSupabaseClient } from "./supabase/client";
import { useAuthSession } from "./useAuthSession";

export interface ReviewData {
  today: string;
  incompleteMits: Task[];
  existingReview: DailyReview | null;
  draft: NightReviewDraft;
  draftCompletionPct: number;
  prediction: DailyPredictionRow | null;
}

export type ReviewFetchState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: ReviewData };

export function useReviewData() {
  const { session, loading: authLoading } = useAuthSession();
  const userId = session?.user.id;
  const [fetchState, setFetchState] = useState<ReviewFetchState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (authLoading || !userId) return;
    let cancelled = false;
    const client = getMobileSupabaseClient();
    getOwnProfile(client).then((profileResult) => {
      if (cancelled) return;
      if (!profileResult.ok) {
        setFetchState({ status: "error", error: profileResult.error.message });
        return;
      }
      const today = getUserLocalToday(profileResult.data.timezone, new Date());
      Promise.all([
        listTasksForDate(client, today),
        getReviewForDate(client, today),
        getNightReviewDraft(client, userId, today),
        getPredictionForDate(client, userId, today),
      ]).then(([tasksResult, reviewResult, draftResult, predictionResult]) => {
        if (cancelled) return;
        if (!tasksResult.ok) {
          setFetchState({ status: "error", error: tasksResult.error.message });
          return;
        }
        if (!reviewResult.ok) {
          setFetchState({ status: "error", error: reviewResult.error.message });
          return;
        }
        if (!draftResult.ok) {
          setFetchState({ status: "error", error: draftResult.error.message });
          return;
        }
        if (!predictionResult.ok) {
          setFetchState({ status: "error", error: predictionResult.error.message });
          return;
        }
        const incompleteMits = tasksResult.data.filter((t) => t.mit_rank != null && t.status !== "completed");
        setFetchState({
          status: "ready",
          data: {
            today,
            incompleteMits,
            existingReview: reviewResult.data,
            draft: draftResult.data,
            draftCompletionPct: completionPctFromDraft(draftResult.data),
            prediction: predictionResult.data,
          },
        });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [authLoading, userId, reloadToken]);

  if (authLoading) return { status: "loading" as const, refetch };
  if (!userId) return { status: "error" as const, error: "Not signed in.", refetch };
  return { ...fetchState, refetch };
}
