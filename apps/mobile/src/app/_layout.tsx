import { color } from "@collegeos/design/native";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider } from "../components/ui/ToastProvider";
import { useDesignFonts } from "../design/fonts";
import { useAuthSession } from "../lib/useAuthSession";

SplashScreen.preventAutoHideAsync();

// Bounce unauthenticated sessions out of app routes, and authenticated sessions off the
// auth-only forms — see docs/SCREEN_SPEC.md §0 and the L(mobile-3) assignment. `/` (the
// welcome screen) and `/auth/callback` (which manages its own post-confirm redirect) are
// deliberately excluded from both sets, matching web's behavior (its landing page and
// /auth/confirm don't force-redirect an already-authenticated visitor either).
const PROTECTED_ROOTS = new Set(["today", "review"]);
const AUTH_ONLY_ROOTS = new Set(["login", "signup", "forgot-password", "reset-password"]);

function useAuthRouting(loading: boolean, isAuthenticated: boolean) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const root = segments[0];
    if (!root) return;

    if (!isAuthenticated && PROTECTED_ROOTS.has(root)) {
      router.replace("/login");
    } else if (isAuthenticated && AUTH_ONLY_ROOTS.has(root)) {
      router.replace("/today");
    }
  }, [loading, isAuthenticated, segments, router]);
}

function RoutedStack() {
  const { loading, session } = useAuthSession();
  useAuthRouting(loading, session != null);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: color.ground },
      }}
    />
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useDesignFonts();

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Never render text before the design system's fonts are loaded — a fallback-face flash is
  // exactly the kind of thing an instrument doesn't do.
  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <RoutedStack />
      </ToastProvider>
    </SafeAreaProvider>
  );
}
