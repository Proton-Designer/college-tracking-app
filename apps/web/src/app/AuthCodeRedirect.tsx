"use client";

import { useSearchParams } from "next/navigation";
import { useEffect } from "react";

/**
 * Supabase's default confirm/reset email links point at `site_url` (this page) when no
 * `redirectTo` is passed at call time. Until `signUp()` exposes one (see the L3 report), a
 * confirmation link lands here with `?code=...` — forward it to /auth/confirm, which is where the
 * actual session-exchange + "email confirmed" UI lives. Harmless no-op when there's no code.
 */
export function AuthCodeRedirect() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");

  useEffect(() => {
    if (code) {
      window.location.replace(`/auth/confirm?code=${encodeURIComponent(code)}`);
    }
  }, [code]);

  return null;
}
