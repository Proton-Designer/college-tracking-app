import { createServerSupabaseClient } from "@collegeos/api/web";
import { NextResponse, type NextRequest } from "next/server";
import { getWebAppEnvironment } from "./lib/supabase/env";

const AUTH_ROUTES = ["/login", "/signup", "/forgot-password", "/reset-password"];
/** Routes that don't require a session and aren't part of the auth flow either. */
const PUBLIC_ROUTES = ["/", "/design", "/auth/confirm"];

function isPathIn(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

// Runs on Node (not Edge) as of Next.js 16's proxy.ts convention — see
// https://nextjs.org/docs/messages/middleware-to-proxy. We still verify the session against
// Supabase (auth.getUser()) rather than just checking cookie presence: a cheaper
// cookie-existence check would let a forged/stale cookie name pass this gate, which defeats the
// point of route protection.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const client = createServerSupabaseClient(getWebAppEnvironment(), {
    getAll: () => request.cookies.getAll(),
    setAll: (cookiesToSet) => {
      for (const { name, value } of cookiesToSet) {
        request.cookies.set(name, value);
      }
      response = NextResponse.next({ request });
      for (const { name, value, options } of cookiesToSet) {
        if (options) {
          response.cookies.set(name, value, options);
        } else {
          response.cookies.set(name, value);
        }
      }
    },
  });

  // Refreshes the session token if needed — this is what "session survives reload" actually
  // depends on; without it, an expired access token just sits in the cookie until something
  // calls getUser(), which for a static/cached page might never happen.
  const {
    data: { user },
    error: authError,
  } = await client.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAuthRoute = isPathIn(pathname, AUTH_ROUTES);
  const isPublicRoute = isPathIn(pathname, PUBLIC_ROUTES);

  // Discarding this error made session loss undiagnosable: a failing getUser() silently
  // becomes "not signed in", @supabase/ssr clears the auth cookie through setAll above, and
  // the user is bounced to /login with nothing written anywhere explaining why. Observed
  // three times during the 2026-08-22 review with an empty server log every time.
  //
  // Logs the error CODE and the path only — never the message body, never a token, never a
  // cookie. Auth errors can echo back credential material and this runs on every request.
  // A signed-out visitor hitting a public or auth route is the normal case, not a signal.
  if (authError && !isPublicRoute && !isAuthRoute) {
    // The message is included OUTSIDE production only. GoTrue's auth error messages are
    // descriptive ("Invalid Refresh Token: Refresh Token Not Found") and do not echo
    // tokens, but this runs on every request and the cost of being wrong about that in
    // production is a credential in a log file. Code and status alone turned out to be
    // too thin to diagnose with — several real failures report code=undefined.
    const detail = process.env.NODE_ENV !== "production" ? ` message=${JSON.stringify(authError.message)}` : "";
    console.warn(
      `[proxy] auth.getUser() failed on ${pathname}: code=${authError.code ?? "unknown"} status=${authError.status ?? "unknown"}${detail}`,
    );
  }

  if (!user && !isAuthRoute && !isPublicRoute) {
    const redirectUrl = new URL("/login", request.url);
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && isAuthRoute) {
    return NextResponse.redirect(new URL("/today", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
