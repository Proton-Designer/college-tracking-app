import type { TypedSupabaseClient } from '../client/types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export interface LlmMonthlySpend {
  spentUsd: number;
  monthStart: string;
}

/** Sum of this user's llm_usage_log.cost_usd since the start of the current calendar
 *  month -- same query composition as supabase/functions/_shared/llm/budget.ts's
 *  getMonthlySpendUsd (the gateway's own pre-flight check), read-only here since this
 *  is display, not enforcement. `now` is a parameter, never `new Date()` internally, so
 *  callers control what "this month" means (real clock in production, fixed in tests). */
export async function getMonthlySpend(client: TypedSupabaseClient, userId: string, now: Date): Promise<DataResult<LlmMonthlySpend>> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data, error } = await client.from('llm_usage_log').select('cost_usd').eq('user_id', userId).gte('created_at', monthStart);
  if (error) return dataErr(mapDataError(error));
  const spentUsd = data.reduce((sum, row) => sum + Number(row.cost_usd), 0);
  return dataOk({ spentUsd, monthStart });
}
