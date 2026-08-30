import Link from "next/link";
import { getOwnProfile, getUserLocalToday, loadVisionChain } from "@collegeos/api";
import { Aurora, PageHeader } from "@/components/ui";
import { VisionClient } from "@/components/vision/VisionClient";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The vision chain (D48) — the four layers above the War Map, as one line.
 *
 * ```
 * 10-Year Vision -> 3-Year Beachhead -> 1-Year Mission -> 90-Day M.O.M. -> goals -> MITs
 * ```
 *
 * Every link is optional and every layer is nullable, so the first-run state of this page is four
 * empty invitations and nothing else. That is the honest state (D40): a person who has not written
 * a ten-year vision does not have one, and seeding a placeholder would be the app pretending on
 * their behalf.
 *
 * The whole view is assembled by `loadVisionChain`, which resolves the chain through
 * `packages/core` — this page decides the local day and renders. It computes nothing, so web and
 * mobile cannot disagree about the same chain.
 */
export default async function VisionPage() {
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

  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) {
    return (
      <main className="mx-auto flex w-full max-w-report flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">
          Couldn&apos;t load the chain
        </p>
        <p className="text-body text-ink-muted">{profileResult.error.message}</p>
      </main>
    );
  }

  // The local day, from the profile timezone — a countdown that rolls over at UTC midnight would
  // read a day wrong for anyone west of Greenwich (B4).
  const today = getUserLocalToday(profileResult.data.timezone, new Date());
  const viewResult = await loadVisionChain(client, user.id, { today });

  if (!viewResult.ok) {
    return (
      <main className="mx-auto flex w-full max-w-report flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">
          Couldn&apos;t load the chain
        </p>
        <p className="text-body text-ink-muted">{viewResult.error.message}</p>
        <Link href="/today" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to Today
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-report flex-1 flex-col gap-8 px-8 py-10">
      <Aurora band={null} />
      <PageHeader
        title="Vision"
        context="Ten years, three years, one year, ninety days. Each layer links to the one above it when there is a link to make."
      />
      <VisionClient view={viewResult.data} />
    </main>
  );
}
