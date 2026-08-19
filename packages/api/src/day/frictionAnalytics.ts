import {
  computeFrictionDistribution,
  computeFrictionTrend,
  type CauseTrendEntry,
  type FrictionDistribution,
  type FrictionLog,
  type LocalDate,
} from '@collegeos/core';
import type { TypedSupabaseClient } from '../client/types';
import { dataErr, dataOk, type DataResult } from '../data/types';
import { mapDataError } from '../data/errors';

async function loadFrictionLogs(
  client: TypedSupabaseClient,
  userId: string,
  since: LocalDate,
  until: LocalDate,
): Promise<DataResult<FrictionLog[]>> {
  const { data, error } = await client
    .from('friction_logs')
    .select('local_date, cause')
    .eq('user_id', userId)
    .gte('local_date', since)
    .lte('local_date', until);
  if (error) return dataErr(mapDataError(error));
  return dataOk((data ?? []).map((row) => ({ date: row.local_date, cause: row.cause })));
}

/** DOMAIN_ENGINE_SPEC.md §9's cause distribution over one window -- pure counting, no
 *  inference (packages/core's own comment), diagnostic rather than judgmental: this is
 *  "what's actually failing and how often", not a verdict on the user. */
export async function computeUserFrictionDistribution(
  client: TypedSupabaseClient,
  userId: string,
  since: LocalDate,
  until: LocalDate,
): Promise<DataResult<FrictionDistribution>> {
  const logs = await loadFrictionLogs(client, userId, since, until);
  if (!logs.ok) return logs;
  return dataOk(computeFrictionDistribution(logs.data));
}

/** Per-cause trend across two consecutive windows -- e.g. "distracted" causes rising
 *  while "underestimated_duration" ones fall, surfaced separately rather than blended
 *  into one number, so the direction of a real change is never averaged away. */
export async function computeUserFrictionTrend(
  client: TypedSupabaseClient,
  userId: string,
  previousWindow: { since: LocalDate; until: LocalDate },
  currentWindow: { since: LocalDate; until: LocalDate },
): Promise<DataResult<CauseTrendEntry[]>> {
  const [previous, current] = await Promise.all([
    loadFrictionLogs(client, userId, previousWindow.since, previousWindow.until),
    loadFrictionLogs(client, userId, currentWindow.since, currentWindow.until),
  ]);
  if (!previous.ok) return previous;
  if (!current.ok) return current;
  return dataOk(computeFrictionTrend(previous.data, current.data));
}
