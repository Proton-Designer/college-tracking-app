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
      <h1
        data-testid="app-heading"
        className="font-serif text-display-m font-semibold tracking-[-0.01em] text-ink"
      >
        CollegeOS
      </h1>
      <p className="text-body text-ink-muted">
        L0 foundation — app shell skeleton. See <code>/_design</code> for the full system.
      </p>
      <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1">
        <dt className="text-label uppercase tracking-[0.1em] text-ink-faint">source</dt>
        <dd data-testid="env-source" className="font-mono text-body-s text-ink">
          {env.debugLabel}
        </dd>
        <dt className="text-label uppercase tracking-[0.1em] text-ink-faint">mode</dt>
        <dd data-testid="env-mode" className="font-mono text-body-s text-ink">
          {env.mode}
        </dd>
        <dt className="text-label uppercase tracking-[0.1em] text-ink-faint">supabaseUrl</dt>
        <dd data-testid="env-supabase-url" className="font-mono text-body-s text-ink">
          {env.supabaseUrl}
        </dd>
      </dl>
    </main>
  );
}
