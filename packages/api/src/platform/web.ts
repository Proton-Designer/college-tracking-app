// Web-only entry point (import from '@collegeos/api/web'). Pulls in @supabase/ssr,
// which apps/mobile must never bundle -- see package.json's `exports` map. The main
// '@collegeos/api' barrel deliberately does NOT re-export these.
export { createBrowserSupabaseClient } from "../client/browserClient";
export { createServerSupabaseClient } from "../client/serverClient";
