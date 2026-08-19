import "server-only";
import { getAgentReport, listAgentReports, parseNightlyReportPayload, type AgentReport, type NightlyAgentReportPayload } from "@collegeos/api";
import { getServerSupabaseClient } from "@/lib/supabase/server";

export interface ReviewReportData {
  date: string;
  /** Null when no report exists for this date at all -- distinct from a report that
   *  exists but couldn't run the model layer (payload.analysis is null in that case,
   *  payload.note explains why). */
  payload: NightlyAgentReportPayload | null;
  /** Every date with a nightly report, newest first -- the history list. */
  history: AgentReport[];
}

export type ReviewReportLoadResult = { ok: true; data: ReviewReportData } | { ok: false; error: string };

export async function loadReviewReport(date: string): Promise<ReviewReportLoadResult> {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  const [reportResult, historyResult] = await Promise.all([
    getAgentReport(client, "nightly", date),
    listAgentReports(client, "nightly", 30),
  ]);
  if (!reportResult.ok) return { ok: false, error: reportResult.error.message };
  if (!historyResult.ok) return { ok: false, error: historyResult.error.message };

  const payload = reportResult.data ? parseNightlyReportPayload(reportResult.data.payload) : null;

  return {
    ok: true,
    data: { date, payload, history: historyResult.data },
  };
}
