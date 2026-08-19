import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type Insight = Database['public']['Tables']['insights']['Row'];

/** Active insights, most recently updated first -- confidence_claimed_by_model is null
 *  for every code-detected insight (no model ran); when it's non-null, confidence_stored
 *  is always <= it (LLM_LAYER_SPEC.md §9's clamp -- the model never gets to promote its
 *  own claim past what the evidence in confidence_stored's tier actually supports). */
export async function listActiveInsights(client: TypedSupabaseClient): Promise<DataResult<Insight[]>> {
  const { data, error } = await client.from('insights').select('*').eq('status', 'active').order('updated_at', { ascending: false });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
