import { resolveAppEnvironment, type AppEnvironment } from "@collegeos/api";

export function getWebAppEnvironment(): AppEnvironment {
  return resolveAppEnvironment({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    debugLabel: "web",
  });
}
