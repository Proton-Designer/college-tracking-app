import { createBrowserClient } from '@supabase/ssr';
import type { AppEnvironment } from '../env';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from './types';

/** One client per browser tab/session — call once and reuse, don't recreate per request. */
export function createBrowserSupabaseClient(env: AppEnvironment): TypedSupabaseClient {
  return createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
}
