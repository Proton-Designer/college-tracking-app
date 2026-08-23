import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { AppEnvironment } from '../env';
import type { Database } from '../database.types';
import type { CookieAdapter, TypedSupabaseClient } from './types';
import { createTimeoutFetch } from './timeoutFetch';

/**
 * A fresh client per request, wired to whatever cookie store the caller's framework
 * exposes. Two correctness rules that are easy to get subtly wrong:
 *
 * 1. `getAll` must return EVERY cookie, not a filtered subset — @supabase/ssr uses this
 *    to detect and clean up stale auth cookie chunks on its own; filtering breaks that.
 * 2. `setAll` must actually persist through to the response the caller returns. In a
 *    Server Component this call will throw (cookies are read-only there) — that's
 *    expected and fine as long as middleware is refreshing the session on every request;
 *    swallow it, don't propagate it.
 */
export function createServerSupabaseClient(
  env: AppEnvironment,
  cookies: CookieAdapter,
): TypedSupabaseClient {
  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options: CookieOptions }>) {
        try {
          cookies.setAll(cookiesToSet);
        } catch {
          // Called from a context where cookies are read-only (e.g. a Server Component).
          // Safe to ignore as long as middleware refreshes the session on every request.
        }
      },
    },
    // P2's REST timeout -- see timeoutFetch.ts.
    global: { fetch: createTimeoutFetch() },
  });
}
