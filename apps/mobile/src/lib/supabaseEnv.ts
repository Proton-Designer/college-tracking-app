import { resolveAppEnvironment, type AppEnvironment } from "@collegeos/api";

export function getMobileAppEnvironment(): AppEnvironment {
  return resolveAppEnvironment({
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    debugLabel: "mobile",
  });
}
