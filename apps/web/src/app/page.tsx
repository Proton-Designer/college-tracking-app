import { resolveAppEnvironment, type AppEnvironment } from "@collegeos/api";

function getEnvironment(): AppEnvironment {
  return resolveAppEnvironment({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    debugLabel: "web",
  });
}

export default function Home() {
  const env = getEnvironment();

  return (
    <main className="flex flex-1 flex-col items-start justify-center gap-4 px-16 py-32">
      <h1 data-testid="app-heading" className="text-3xl font-semibold tracking-tight">
        CollegeOS
      </h1>
      <p className="text-base text-neutral-600">
        L0 foundation — app shell skeleton. Design system pending.
      </p>
      <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 font-mono text-sm">
        <dt className="text-neutral-500">source</dt>
        <dd data-testid="env-source">{env.debugLabel}</dd>
        <dt className="text-neutral-500">mode</dt>
        <dd data-testid="env-mode">{env.mode}</dd>
        <dt className="text-neutral-500">supabaseUrl</dt>
        <dd data-testid="env-supabase-url">{env.supabaseUrl}</dd>
      </dl>
    </main>
  );
}
