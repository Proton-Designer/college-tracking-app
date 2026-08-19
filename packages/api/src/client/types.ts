import type { Database } from '../database.types';
import type { SupabaseClient } from '@supabase/supabase-js';

export type TypedSupabaseClient = SupabaseClient<Database>;

/**
 * Framework-agnostic cookie adapter. `packages/api` never imports `next/server` or any
 * other framework's types directly — the app supplies a thin implementation of this
 * shape (Next's `cookies()`/`NextRequest`/`NextResponse`, an Express req/res, etc). This
 * is what `@supabase/ssr` calls `getAll`/`setAll`; getting these two methods to actually
 * round-trip EVERY cookie (not just the auth ones) is the difference between a session
 * that works and one that works until it silently doesn't.
 */
export interface CookieAdapter {
  getAll(): Array<{ name: string; value: string }>;
  setAll(cookies: Array<{ name: string; value: string; options?: Record<string, unknown> }>): void;
}
