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
