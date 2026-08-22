import { getOwnProfile, getUserLocalToday, getWeeklyPlan, type WeeklyPlanView } from "@collegeos/api";
import { startOfWeek, type LocalDate } from "@collegeos/core";
import { useCallback, useEffect, useState } from "react";
import { getMobileSupabaseClient } from "./supabase/client";
import { useAuthSession } from "./useAuthSession";

export interface ThisWeekData {
  today: LocalDate;
  weekStartDate: LocalDate;
  timezone: string;
  /** Null means no plan has been generated for this week yet -- the empty state's trigger. */
  plan: WeeklyPlanView | null;
}

export type ThisWeekFetchState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: ThisWeekData };

/** Mirrors apps/web/src/app/(app)/calendar/data.ts's loadThisWeekView exactly. */
export function useThisWeekData() {
  const { session, loading: authLoading } = useAuthSession();
  const userId = session?.user.id;
  const [fetchState, setFetchState] = useState<ThisWeekFetchState>({ status: "loading" });
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
      const profile = profileResult.data;
      const today = getUserLocalToday(profile.timezone, new Date());
      const weekStartDate = startOfWeek(today);

      getWeeklyPlan(client, userId, weekStartDate, today).then((planResult) => {
        if (cancelled) return;
        if (!planResult.ok) {
          setFetchState({ status: "error", error: planResult.error.message });
          return;
        }
        setFetchState({ status: "ready", data: { today, weekStartDate, timezone: profile.timezone, plan: planResult.data } });
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
