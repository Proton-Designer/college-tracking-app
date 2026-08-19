// Shared HTTP plumbing for every Edge Function in this project -- the pattern
// established here (JWT verification, response shape, CORS) is meant to be reused by
// every future function, not just syllabus-confirm/syllabus-extract.

// deno-lint-ignore no-explicit-any
type AnySupabaseClient = any;

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS_HEADERS },
  });
}

/** Every handler returns one of these two shapes -- apps can rely on `ok` alone to branch. */
export type ApiOk<T> = { ok: true; data: T };
export type ApiErr = { ok: false; error: string };

export function apiOk<T>(data: T, status = 200): Response {
  return jsonResponse({ ok: true, data } satisfies ApiOk<T>, status);
}

export function apiErr(error: string, status: number): Response {
  return jsonResponse({ ok: false, error } satisfies ApiErr, status);
}

/** A bare 204 for CORS preflight -- call this first in every handler. */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return null;
}

/**
 * Verifies the caller's JWT and returns their real, platform-confirmed user id --
 * NEVER trust a `userId` field in a request body for this, since nothing stops a caller
 * from putting someone else's id there. The platform's own JWT verification (config.toml's
 * `verify_jwt = true` for this function) already rejects a missing/malformed/expired
 * token before the function even runs; this does the same check again via a live
 * round-trip to GoTrue (auth.getUser, not a local JWT decode) so a token that's been
 * revoked since it was issued is also caught, and so the client this returns is
 * authenticated AS the caller -- every downstream query runs under their own RLS, not
 * service-role, which is a second layer of enforcement beneath the input-validation one.
 */
export async function getVerifiedCaller(
  req: Request,
  createClient: (url: string, key: string, opts: Record<string, unknown>) => AnySupabaseClient,
): Promise<{ ok: true; userId: string; email: string | null; client: AnySupabaseClient } | { ok: false; response: Response }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { ok: false, response: apiErr("Missing Authorization header.", 401) };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return { ok: false, response: apiErr("Server misconfigured: missing Supabase environment.", 500) };
  }

  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data?.user) {
    return { ok: false, response: apiErr("Invalid or expired session.", 401) };
  }

  return { ok: true, userId: data.user.id, email: data.user.email ?? null, client };
}
