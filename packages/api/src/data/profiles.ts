import type { TypedSupabaseClient } from '../client/types';
import type { Database } from '../database.types';
import { dataErr, dataOk, type DataResult } from './types';
import { mapDataError } from './errors';

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];

/** Relies on RLS alone — no explicit filter needed, the session can only ever see its own row. */
export async function getOwnProfile(client: TypedSupabaseClient): Promise<DataResult<Profile>> {
  const { data, error } = await client.from('profiles').select('*').single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}

export async function updateOwnProfile(
  client: TypedSupabaseClient,
  userId: string,
  patch: ProfileUpdate,
): Promise<DataResult<Profile>> {
  const { data, error } = await client.from('profiles').update(patch).eq('id', userId).select().single();
  if (error) return dataErr(mapDataError(error));
  return dataOk(data);
}
