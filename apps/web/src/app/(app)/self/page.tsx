import Link from "next/link";
import { getOwnProfile, getUserLocalToday, loadSelf } from "@collegeos/api";
import { addDays } from "@collegeos/core";
import { PageHeader } from "@/components/ui";
import { SelfClient } from "@/components/self/SelfClient";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Desired Self — the destination the other four pillars serve.
 *
 * Nothing here is stored. `loadSelf` gathers the acts each dimension's routing map claims, replays
 * them through the decay model in `packages/core`, and returns standings **with their evidence
 * attached**. There is no score column to read and no total to show (D34).
 *
 * The evidence window is 90 days: past that the decay has made an act irrelevant to the current
 * standing anyway, and reading a year of history on every render would buy nothing.
 */
const EVIDENCE_WINDOW_DAYS = 90;

export default async function SelfPage() {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return (
      <main className="mx-auto flex w-full max-w-report flex-1 flex-col gap-3 px-8 py-12">
        <p className="text-body text-ink-muted">Not signed in.</p>
      </main>
    );
  }

  const profile = await getOwnProfile(client);
  if (!profile.ok) {
    return (
      <main className="mx-auto flex w-full max-w-report flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">
          Couldn&apos;t load Self
        </p>
        <p className="text-body text-ink-muted">{profile.error.message}</p>
      </main>
    );
  }

  const today = getUserLocalToday(profile.data.timezone, new Date());
  const view = await loadSelf(client, user.id, {
    today,
    windowStart: addDays(today, -EVIDENCE_WINDOW_DAYS),
  });

  if (!view.ok) {
    return (
      <main className="mx-auto flex w-full max-w-report flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">
          Couldn&apos;t load Self
        </p>
        <p className="text-body text-ink-muted">{view.error.message}</p>
        <Link href="/today" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to Today
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-report flex-1 flex-col gap-6 px-8 py-12">
      <PageHeader title="Self" context="Last 90 days" />
      <SelfClient view={view.data} />
    </main>
  );
}
