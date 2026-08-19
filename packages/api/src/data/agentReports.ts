import type { LocalDate } from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type AgentReport = Database['public']['Tables']['agent_reports']['Row'];
export type AgentReportType = Database['public']['Tables']['agent_reports']['Row']['report_type'];

/**
 * The one row for a given report type + anchor date. `local_date` is the report's
 * anchor date regardless of type -- the day itself for 'nightly', the week's start date
 * for 'weekly'. Nova's /review UI: this is what backs "tonight's report" / "this week's
 * synthesis." `payload` is the NightlyAgentReportPayload shape
 * (supabase/functions/_shared/nightly/runNightlyAnalysis.ts) for 'nightly' rows --
 * always `{ deterministic, analysis, note }`, where `analysis` is null and `note`
 * explains why whenever the model layer didn't run.
 */
export async function getAgentReport(
  client: TypedSupabaseClient,
  reportType: AgentReportType,
  localDate: LocalDate,
): Promise<DataResult<AgentReport | null>> {
  const { data, error } = await client
    .from('agent_reports')
    .select('*')
    .eq('report_type', reportType)
    .eq('local_date', localDate)
    .maybeSingle();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

/** Most recent reports of one type, newest first -- e.g. a /review history list. */
export async function listAgentReports(
  client: TypedSupabaseClient,
  reportType: AgentReportType,
  limit = 30,
): Promise<DataResult<AgentReport[]>> {
  const { data, error } = await client
    .from('agent_reports')
    .select('*')
    .eq('report_type', reportType)
    .order('local_date', { ascending: false })
    .limit(limit);
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
