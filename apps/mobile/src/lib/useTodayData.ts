import { getDayView, listCourses, type Course, type DayView } from "@collegeos/api";
import { useCallback, useEffect, useState } from "react";
import { getMobileSupabaseClient } from "./supabase/client";
import { useAuthSession } from "./useAuthSession";

export type TodayMode = "unplanned" | "recovery" | "normal";

export interface TodayData {
  dayView: DayView;
  courses: Record<number, Course>;
  mode: TodayMode;
}

export type FetchState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: TodayData };

/** Mode is decided here, once, from the engine's own outputs — mirrors
 *  apps/web/src/app/today/data.ts's decideMode exactly. Recovery outranks unplanned
 *  because a triggered Recovery Mode is the more urgent fact even with no check-in yet. */
function decideMode(dayView: DayView): TodayMode {
  if (dayView.recoveryMode.triggered) return "recovery";
  if (dayView.todayCheckin == null) return "unplanned";
  return "normal";
}

/**
 * `asOfIso` is a dev-only override for inspecting a specific historical day (e.g. a real
 * Recovery Mode trigger) — an ISO string rather than a Date so it's a stable hook dependency;
 * never wired to any UI control, same convention as web's `?asOf=` query param.
 */
export function useTodayData(asOfIso?: string) {
  const { session, loading: authLoading } = useAuthSession();
  const userId = session?.user.id;
  const [fetchState, setFetchState] = useState<FetchState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (authLoading || !userId) return;

    let cancelled = false;
    const client = getMobileSupabaseClient();
    const asOf = asOfIso ? new Date(asOfIso) : undefined;

    Promise.all([getDayView(client, userId, asOf), listCourses(client)]).then(([dayViewResult, coursesResult]) => {
      if (cancelled) return;
      if (!dayViewResult.ok) {
        setFetchState({ status: "error", error: dayViewResult.error.message });
        return;
      }
      if (!coursesResult.ok) {
        setFetchState({ status: "error", error: coursesResult.error.message });
        return;
      }
      setFetchState({
        status: "ready",
        data: {
          dayView: dayViewResult.data,
          courses: Object.fromEntries(coursesResult.data.map((c) => [c.id, c])),
          mode: decideMode(dayViewResult.data),
        },
      });
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, userId, asOfIso, reloadToken]);

  if (authLoading) return { status: "loading" as const, refetch };
  if (!userId) return { status: "error" as const, error: "Not signed in.", refetch };
  return { ...fetchState, refetch };
}
