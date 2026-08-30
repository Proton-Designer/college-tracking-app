import Link from "next/link";
import { getOwnProfile, getUserLocalToday, loadDailySession } from "@collegeos/api";
import { PageHeader } from "@/components/ui";
import { LearnClient } from "@/components/learn/LearnClient";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The Learn tab — ULM's daily retention session.
 *
 * Nothing here computes: `loadDailySession` replays the append-only review log through
 * `packages/core`'s FSRS scheduler and hands back a plan. This file fetches, resolves the user's
 * own local day and their own settings (the new-lesson limit and desired retention are per-user
 * data, not constants — D39), and lays out.
 *
 * **Scope, from the directive and worth restating at the entry point:** this pillar is business and
 * self-improvement learning only. Course knowledge lives in the Question Bank and never mixes in.
 * They study for different reasons — school knowledge has a deadline and an exam as its terminal
 * event, this has neither — and interleaving them would make both queues worse.
 */
export default async function LearnPage() {
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
          Couldn&apos;t load Learn
        </p>
        <p className="text-body text-ink-muted">{profile.error.message}</p>
      </main>
    );
  }

  const today = getUserLocalToday(profile.data.timezone, new Date());
  const session = await loadDailySession(client, user.id, {
    today,
    newLimit: profile.data.daily_new_lesson_limit,
  });

  if (!session.ok) {
    return (
      <main className="mx-auto flex w-full max-w-report flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">
          Couldn&apos;t load Learn
        </p>
        <p className="text-body text-ink-muted">{session.error.message}</p>
        <Link href="/today" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to Today
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-report flex-1 flex-col gap-6 px-8 py-12">
      <PageHeader
        title="Learn"
        actions={
          <Link href="/learn/library" className="font-mono text-body-s text-accent underline underline-offset-2">
            Library
          </Link>
        }
      />
      <LearnClient view={session.data} />
    </main>
  );
}
