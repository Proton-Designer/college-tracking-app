import { color } from "@collegeos/design/native";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ToastProvider } from "../components/ui/ToastProvider";
import { useDesignFonts } from "../design/fonts";
import { ensureNightPlanReminder } from "../lib/nightPlanNotifications";
import { useAuthSession } from "../lib/useAuthSession";

SplashScreen.preventAutoHideAsync();

// Bounce unauthenticated sessions out of app routes, and authenticated sessions off the
// auth-only forms — see docs/SCREEN_SPEC.md §0. Default-protect (mirrors web's proxy.ts):
// everything is auth-required except an explicit public/auth-only allowlist, rather than an
// allowlist of protected roots -- so a new route (the "(tabs)" group, "settings", any future
// screen) is protected by default instead of silently open until someone remembers to add it
// here. `/` (the welcome screen) and `/auth/callback` (which manages its own post-confirm
// redirect) stay public, matching web's landing page and /auth/confirm.
const PUBLIC_ROOTS = new Set(["", "auth", "design"]);
const AUTH_ONLY_ROOTS = new Set(["login", "signup", "forgot-password", "reset-password"]);

function useAuthRouting(loading: boolean, isAuthenticated: boolean) {
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const root = segments[0] ?? "";

    const isAuthOnly = AUTH_ONLY_ROOTS.has(root);
    const isPublic = PUBLIC_ROOTS.has(root);

    if (!isAuthenticated && !isAuthOnly && !isPublic) {
      router.replace("/login");
    } else if (isAuthenticated && isAuthOnly) {
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
    >
      {/* Without an explicit title, a screen pushed on top (e.g. /settings) inherits the
          literal route-group folder name "(tabs)" as its back button's accessible name --
          invisible with headerBackButtonDisplayMode: "minimal" (no text on screen) but still
          read aloud by VoiceOver. Found live on a real device, not in review. */}
      <Stack.Screen name="(tabs)" options={{ title: "Today" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useDesignFonts();

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Re-assert the nightly Night Plan reminder on launch. Deliberately does NOT prompt: if
  // permission was never granted this silently does nothing, and the Night Plan screen
  // carries the explicit control where the reason for it is on screen. Scheduling uses one
  // fixed identifier, so repeating this on every launch replaces the schedule rather than
  // stacking a second nightly banner.
  useEffect(() => {
    void ensureNightPlanReminder();
  }, []);

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
