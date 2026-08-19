import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { getMobileSupabaseClient } from "./supabase/client";

export type DeepLinkSessionState = "checking" | "valid" | "invalid";

/**
 * Exchanges the PKCE `code` in this route's params for a real session — the manual
 * equivalent of @supabase/ssr's `detectSessionInUrl` on web, which has nothing to detect
 * on native since there's no URL bar/history. Used by both /auth/callback (signup
 * confirmation) and /reset-password (recovery), each exchanging its own deep link's code.
 *
 * Reads the code via useLocalSearchParams (Expo Router's own resolved route params)
 * rather than re-parsing Linking.useURL() -- confirmed live that the latter can return a
 * stale pre-navigation URL on a cold start via Safari's "Open in Expo Go" handoff, even
 * though Expo Router itself had already routed to this screen with the right params.
 */
export function useDeepLinkSession(): DeepLinkSessionState {
  const [state, setState] = useState<DeepLinkSessionState>("checking");
  const { code: rawCode } = useLocalSearchParams<{ code?: string }>();
  const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;

  useEffect(() => {
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
  }, [code]);

  return state;
}
