import { onAuthStateChange, type Session } from "@collegeos/api";
import { useEffect, useState } from "react";
import { getMobileSupabaseClient } from "./supabase/client";

export interface AuthSessionState {
  loading: boolean;
  session: Session | null;
}

/**
 * Tracks the current session for the app's lifetime via onAuthStateChange — this is the
 * one place route protection reads session state from, so the redirect logic in
 * _layout.tsx and any screen that needs "am I signed in" never drift from each other.
 */
export function useAuthSession(): AuthSessionState {
  const [state, setState] = useState<AuthSessionState>({ loading: true, session: null });

  useEffect(() => {
    const client = getMobileSupabaseClient();
    let cancelled = false;

    client.auth.getSession().then(({ data }) => {
      if (!cancelled) setState({ loading: false, session: data.session });
    });

    const subscription = onAuthStateChange(client, (_event, session) => {
      if (!cancelled) setState({ loading: false, session });
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
