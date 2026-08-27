import { loadCalendarHorizon, type CalendarHorizon } from "@collegeos/api";
import { useCallback, useEffect, useState } from "react";
import { getMobileSupabaseClient } from "./supabase/client";
import { useAuthSession } from "./useAuthSession";

export type { CalendarObligation, BackplanChain } from "@collegeos/api";
/** Kept as an alias so existing component imports of `CalendarData` still resolve. */
export type CalendarData = CalendarHorizon;

export type CalendarFetchState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: CalendarData };

/**
 * The calendar horizon on mobile.
 *
 * This hook used to carry its own copy of the composition, and said so — its comment read
 * "Mirrors apps/web/src/app/(app)/calendar/data.ts's loadCalendarHorizon exactly." Two
 * hand-synchronised copies of the same query orchestration is the divergence D1 exists to
 * prevent, and "exactly" is a claim that only stays true until one side is edited.
 *
 * The composition now lives once, in packages/api's calendarView. What remains here is
 * genuinely mobile: the auth session, the React fetch lifecycle, and cancel-on-unmount.
 */
export function useCalendarData() {
  const { session, loading: authLoading } = useAuthSession();
  const userId = session?.user.id ?? null;
  const [fetchState, setFetchState] = useState<CalendarFetchState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);

  const refetch = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    if (authLoading || userId == null) return;
    let cancelled = false;
    setFetchState({ status: "loading" });

    void loadCalendarHorizon(getMobileSupabaseClient(), userId).then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setFetchState({ status: "error", error: result.error.message });
        return;
      }
      setFetchState({ status: "ready", data: result.data });
    });

    return () => {
      cancelled = true;
    };
  }, [authLoading, userId, reloadToken]);

  if (authLoading) return { status: "loading" as const, refetch };
  if (!userId) return { status: "error" as const, error: "Not signed in.", refetch };
  return { ...fetchState, refetch };
}
