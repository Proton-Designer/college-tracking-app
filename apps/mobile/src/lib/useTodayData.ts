import {
  getActiveFocusSession,
  getDayView,
  listCourses,
  listKillHabits,
  listPendingInterventions,
  runInterventionSweep,
  type Course,
  type DayView,
  type InterventionRow,
  type KillHabitRow,
  type TaskSessionRow,
} from "@collegeos/api";
import { useCallback, useEffect, useState } from "react";
import { getMobileSupabaseClient } from "./supabase/client";
import { useAuthSession } from "./useAuthSession";

export type TodayMode = "unplanned" | "recovery" | "normal";

export interface TodayData {
  dayView: DayView;
  courses: Record<number, Course>;
  mode: TodayMode;
  /** Today's active kill-list commitments — SCREEN_SPEC §1.6. */
  killHabits: KillHabitRow[];
  /** Non-null when a focus session is already running — the launcher becomes
   *  "Resume focus" instead of trying (and failing) to start a second one. */
  activeFocusSession: TaskSessionRow | null;
  /** U1 -- prompts awaiting a decision. Includes `pending` and `delivered`: seeing one
   *  doesn't answer it, so it stays until responded to or dismissed. Mirrors web. */
  interventions: InterventionRow[];
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

    Promise.all([
      getDayView(client, userId, asOf),
      listCourses(client),
      listKillHabits(client, userId),
      getActiveFocusSession(client, userId),
    ]).then(([dayViewResult, coursesResult, killHabitsResult, activeFocusSessionResult]) => {
      if (cancelled) return;
      if (!dayViewResult.ok) {
        setFetchState({ status: "error", error: dayViewResult.error.message });
        return;
      }
      if (!coursesResult.ok) {
        setFetchState({ status: "error", error: coursesResult.error.message });
        return;
      }
      if (!killHabitsResult.ok) {
        setFetchState({ status: "error", error: killHabitsResult.error.message });
        return;
      }
      if (!activeFocusSessionResult.ok) {
        setFetchState({ status: "error", error: activeFocusSessionResult.error.message });
        return;
      }
      // U1. Runs AFTER the reads because the sweep writes intervention rows and the listing
      // has to see what it just created. Every evaluator dedupes, so re-running produces
      // nothing new. A failed sweep degrades to no prompts rather than an error screen --
      // interventions are advisory and must never cost the user their Today.
      void runInterventionSweep(client, userId, dayViewResult.data.today, asOf ?? new Date())
        .then(() => listPendingInterventions(client, userId))
        .then((interventionsResult) => {
          if (cancelled) return;
          setFetchState((prev) =>
            prev.status === "ready"
              ? { ...prev, data: { ...prev.data, interventions: interventionsResult.ok ? interventionsResult.data : [] } }
              : prev,
          );
        });

      setFetchState({
        status: "ready",
        data: {
          dayView: dayViewResult.data,
          courses: Object.fromEntries(coursesResult.data.map((c) => [c.id, c])),
          mode: decideMode(dayViewResult.data),
          killHabits: killHabitsResult.data,
          activeFocusSession: activeFocusSessionResult.data,
          interventions: [],
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
