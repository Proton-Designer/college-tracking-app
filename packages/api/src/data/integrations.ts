import type { TypedSupabaseClient } from '../client/types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type OAuthProvider = 'whoop' | 'google_calendar' | 'microsoft' | 'rescuetime';

export interface IntegrationStatus {
  provider: OAuthProvider;
  /** Null when never connected -- never fabricated as "unconfigured" vs "expired" vs
   *  "revoked", those are three different real states this reads directly. */
  connectionStatus: 'active' | 'expired' | 'revoked' | null;
  connectedAt: string | null;
  externalAccountId: string | null;
  /** The most recent local_date this provider's rollup table actually has data for --
   *  a real observed date, not a sync-run timestamp we don't track. Null when the
   *  provider has no rollup data yet (never connected, or connected but nothing synced). */
  lastSyncedLocalDate: string | null;
}

const ROLLUP_TABLE_BY_PROVIDER: Partial<Record<OAuthProvider, { table: 'health_daily' | 'screen_daily'; source: string }>> = {
  whoop: { table: 'health_daily', source: 'whoop' },
  rescuetime: { table: 'screen_daily', source: 'rescuetime' },
};

/** All four providers the schema knows about (oauth_connections' own check constraint),
 *  even though only whoop/rescuetime have a rollup table today -- the other two report
 *  connection state with a null lastSyncedLocalDate rather than being omitted. */
const ALL_PROVIDERS: OAuthProvider[] = ['whoop', 'google_calendar', 'microsoft', 'rescuetime'];

export async function listIntegrationStatuses(client: TypedSupabaseClient, userId: string): Promise<DataResult<IntegrationStatus[]>> {
  const { data: connections, error } = await client
    .from('oauth_connections')
    .select('provider, status, connected_at, external_account_id')
    .eq('user_id', userId);
  if (error) return dataErr(mapDataError(error));

  const connectionByProvider = new Map(connections.map((c) => [c.provider, c]));

  const statuses = await Promise.all(
    ALL_PROVIDERS.map(async (provider): Promise<IntegrationStatus> => {
      const connection = connectionByProvider.get(provider);
      const rollup = ROLLUP_TABLE_BY_PROVIDER[provider];
      let lastSyncedLocalDate: string | null = null;
      if (rollup) {
        const { data: rows } = await client
          .from(rollup.table)
          .select('local_date')
          .eq('user_id', userId)
          .eq('source', rollup.source)
          .order('local_date', { ascending: false })
          .limit(1);
        lastSyncedLocalDate = rows?.[0]?.local_date ?? null;
      }
      return {
        provider,
        connectionStatus: (connection?.status as IntegrationStatus['connectionStatus']) ?? null,
        connectedAt: connection?.connected_at ?? null,
        externalAccountId: connection?.external_account_id ?? null,
        lastSyncedLocalDate,
      };
    }),
  );

  return dataOk(statuses);
}

/** Deletes the underlying Vault secret (migration 0028), which cascades away the
 *  oauth_connections row -- a real disconnect, not a soft status flip that leaves a
 *  live credential sitting in Vault. Returns false if there was nothing to disconnect. */
export async function disconnectIntegration(
  client: TypedSupabaseClient,
  userId: string,
  provider: OAuthProvider,
): Promise<DataResult<boolean>> {
  const { data, error } = await client.rpc('disconnect_oauth_connection', { p_user_id: userId, p_provider: provider });
  if (error) return dataErr(mapDataError(error));
  return dataOk(data ?? false);
}
