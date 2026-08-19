import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { getMobileSupabaseClient } from "./supabase/client";

export type DeepLinkSessionState = "checking" | "valid" | "invalid";

/**
 * Exchanges the PKCE `code` in the URL that opened this screen for a real session — the
 * manual equivalent of @supabase/ssr's `detectSessionInUrl` on web, which has nothing to
 * detect on native since there's no URL bar/history. Used by both /auth/callback (signup
 * confirmation) and /reset-password (recovery), each exchanging its own deep link's code.
 */
export function useDeepLinkSession(): DeepLinkSessionState {
  const [state, setState] = useState<DeepLinkSessionState>("checking");
  const url = Linking.useURL();

  useEffect(() => {
    if (!url) return undefined;

    const { queryParams } = Linking.parse(url);
    const code = queryParams?.code;
    let cancelled = false;

    if (typeof code !== "string") {
      // Deferred, not called synchronously in the effect body -- same async-callback
      // shape as the exchangeCodeForSession branch below, just with nothing to await.
      Promise.resolve().then(() => {
        if (!cancelled) setState("invalid");
      });
    } else {
      getMobileSupabaseClient()
        .auth.exchangeCodeForSession(code)
        .then(({ data, error }) => {
          if (!cancelled) setState(!error && data.session ? "valid" : "invalid");
        });
    }

    return () => {
      cancelled = true;
    };
  }, [url]);

  return state;
}
