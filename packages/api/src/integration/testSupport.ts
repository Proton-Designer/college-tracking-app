import { createClient } from '@supabase/supabase-js';
import type { Database } from '../database.types';

// Single source of truth for the seeded demo account every integration test signs in
// as. Previously each *.itest.ts file redeclared these three constants independently --
// harmless duplication until the credential drifted once (see S1 below) and every file
// needed the same fix pasted six times.
export const DEMO_EMAIL = 'demo@collegeos.app';
export const DEMO_PASSWORD = 'CollegeOS-Demo-2026';
// Hardcoded in supabase/seed.sql's `v_user_id` -- deterministic across every `db reset`,
// so this is safe to hardcode here too rather than looking it up.
export const DEMO_USER_ID = '00000000-0000-0000-0000-0000000000d1';

export const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
export const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Creates a dedicated, pre-confirmed throwaway user for tests that WRITE mutating data.
 * demo@collegeos.app's value IS its realistic, stable, screenshot-worthy semester data --
 * every write to it degrades that for the person actually looking at it. "Reads against
 * demo, writes against a throwaway" -- first drawn in rlsSession.itest.ts, generalized
 * here after focusSessions.itest.ts contaminated the demo account with distinctive-
 * duration test rows that survived between runs and cost real debugging time.
 */
export async function createConfirmedUser(email: string, password: string) {
  const admin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('admin.createUser returned no user');
  return data.user;
}
