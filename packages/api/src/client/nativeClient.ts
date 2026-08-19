import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, type AppStateStatus } from 'react-native';
import type { AppEnvironment } from '../env';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from './types';

/**
 * React Native does not pause JS timers in the background the way a browser tab does,
 * but it also doesn't reliably run them — a backgrounded app's token can go stale, and
 * without this the app resumes with a dead session that looks like a random logout.
 * supabase-js's own auto-refresh timer only runs while something is actively calling
 * `startAutoRefresh`; we drive that from AppState transitions per Supabase's own
 * React Native guidance.
 */
export function createNativeSupabaseClient(env: AppEnvironment): TypedSupabaseClient {
  const client = createClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // There is no URL to parse a session out of on native.
      detectSessionInUrl: false,
    },
  });

  const handleAppStateChange = (state: AppStateStatus) => {
    if (state === 'active') {
      client.auth.startAutoRefresh();
    } else {
      client.auth.stopAutoRefresh();
    }
  };

  AppState.addEventListener('change', handleAppStateChange);
  if (AppState.currentState === 'active') {
    client.auth.startAutoRefresh();
  }

  return client;
}
