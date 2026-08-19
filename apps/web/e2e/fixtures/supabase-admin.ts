import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for test setup/teardown only. Never import this outside the e2e
 * harness — the service role key bypasses RLS and must never reach app code or a browser bundle.
 */
function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to run e2e tests (local Supabase must be running: npm run db:start).",
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const supabaseAdmin = getSupabaseAdmin();
