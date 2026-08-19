/**
 * Single env gate (MASTER_PLAN §3). Each app reads its own prefixed env vars
 * (NEXT_PUBLIC_* / EXPO_PUBLIC_*) and passes the raw values here — this is the only place that
 * validates and types them. Swapping local → cloud Supabase is changing two env vars upstream;
 * nothing below this function needs to know which environment it's running in.
 */

export type AppEnvironmentMode = "local" | "cloud";

export interface AppEnvironmentInput {
  supabaseUrl: string | undefined;
  supabaseAnonKey: string | undefined;
  /** Optional human label surfaced in dev UI / logs, e.g. "web" or "mobile". */
  debugLabel?: string;
}

export interface AppEnvironment {
  supabaseUrl: string;
  supabaseAnonKey: string;
  mode: AppEnvironmentMode;
  debugLabel?: string;
}

export function resolveAppEnvironment(input: AppEnvironmentInput): AppEnvironment {
  if (!input.supabaseUrl || !input.supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment configuration: supabaseUrl and supabaseAnonKey are both required.",
    );
  }

  const mode: AppEnvironmentMode =
    input.supabaseUrl.includes("127.0.0.1") || input.supabaseUrl.includes("localhost")
      ? "local"
      : "cloud";

  return {
    supabaseUrl: input.supabaseUrl,
    supabaseAnonKey: input.supabaseAnonKey,
    mode,
    ...(input.debugLabel !== undefined ? { debugLabel: input.debugLabel } : {}),
  };
}
