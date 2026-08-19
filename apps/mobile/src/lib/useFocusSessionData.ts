import { getFocusSessionContext, type FocusSessionContext } from "@collegeos/api";
import { useEffect, useState } from "react";
import { getMobileSupabaseClient } from "./supabase/client";
import { useAuthSession } from "./useAuthSession";

export type FocusSessionFetchState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: FocusSessionContext };

export function useFocusSessionData(sessionId: number) {
  const { session, loading: authLoading } = useAuthSession();
  const userId = session?.user.id;
  const [fetchState, setFetchState] = useState<FocusSessionFetchState>({ status: "loading" });

  useEffect(() => {
    if (authLoading || !userId) return;
    let cancelled = false;
    const client = getMobileSupabaseClient();

    getFocusSessionContext(client, userId, sessionId).then((result) => {
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
  }, [authLoading, userId, sessionId]);

  if (authLoading) return { status: "loading" as const };
  if (!userId) return { status: "error" as const, error: "Not signed in." };
  return fetchState;
}
