import type { TypedSupabaseClient } from '../client/types';
import type { DataResult } from './types';
import { invokeEdgeFunction } from './invoke';

export interface MorningBrief {
  brief: string;
  source: 'model' | 'deterministic';
  cached: boolean;
}

/** Fetches (generating once per local day, server-cached) the Start Day morning brief. */
export async function getMorningBrief(
  client: TypedSupabaseClient,
  localDate: string,
): Promise<DataResult<MorningBrief>> {
  return invokeEdgeFunction<MorningBrief>(client, 'morning-brief', { localDate });
}
