import {
  getAgentReport,
  listAgentReports,
  parseNightlyReportPayload,
  type AgentReport,
  type NightlyAgentReportPayload,
} from "@collegeos/api";
import { useCallback, useEffect, useState } from "react";
import { getMobileSupabaseClient } from "./supabase/client";
import { useAuthSession } from "./useAuthSession";

export interface ReviewReportData {
  date: string;
  /** Null when no report exists for this date at all -- distinct from a report that
   *  exists but couldn't run the model layer (payload.analysis is null in that case,
   *  payload.note explains why). */
  payload: NightlyAgentReportPayload | null;
  /** Every date with a nightly report, newest first -- the history list. */
  history: AgentReport[];
}

export type ReviewReportFetchState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: ReviewReportData };

/** Mirrors apps/web/src/app/(app)/review/[date]/data.ts's loadReviewReport exactly -- same
 *  two parallel reads, same defensive payload parsing (an unparseable/legacy-shaped row
 *  renders the honest "no report" fallback rather than crashing). */
export function useReviewReportData(date: string) {
  const { session, loading: authLoading } = useAuthSession();
  const userId = session?.user.id;
  const [fetchState, setFetchState] = useState<ReviewReportFetchState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);
  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  useEffect(() => {
    if (authLoading || !userId) return;
    let cancelled = false;
    const client = getMobileSupabaseClient();

    Promise.all([getAgentReport(client, "nightly", date), listAgentReports(client, "nightly", 30)]).then(
      ([reportResult, historyResult]) => {
        if (cancelled) return;
        if (!reportResult.ok) {
          setFetchState({ status: "error", error: reportResult.error.message });
          return;
        }
        if (!historyResult.ok) {
          setFetchState({ status: "error", error: historyResult.error.message });
          return;
        }

        const payload = reportResult.data ? parseNightlyReportPayload(reportResult.data.payload) : null;
        setFetchState({ status: "ready", data: { date, payload, history: historyResult.data } });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [authLoading, userId, date, reloadToken]);

  if (authLoading) return { status: "loading" as const, refetch };
  if (!userId) return { status: "error" as const, error: "Not signed in.", refetch };
  return { ...fetchState, refetch };
}
