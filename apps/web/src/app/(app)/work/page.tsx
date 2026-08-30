import Link from "next/link";
import { loadWorkOverview } from "@collegeos/api";
import { Aurora, PageHeader } from "@/components/ui";
import { WorkClient } from "@/components/work/WorkClient";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The Work surface, web. Two things: the targets pipeline (active / blocked / done, with tasks
 * under each) and the week's shifts.
 *
 * `loadWorkOverview` does the fetching and resolves both shift shapes — recurring-by-weekday
 * and one-off-by-date, which migration 53 keeps in one table behind an XOR constraint — onto
 * one Sun–Sat week. Mobile's `apps/mobile/src/app/work.tsx` calls the same function.
 *
 * D42 note for anyone reading LifeOS alongside this: his schema calls this domain `co_op`
 * throughout. It is `work` here, top to bottom, matching the `life_domain` enum — one word for
 * one concept rather than a synonym every future reader has to learn.
 */
export default async function WorkPage() {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-3 px-8 py-12">
        <p className="text-body text-ink-muted">Not signed in.</p>
      </main>
    );
  }

  const overview = await loadWorkOverview(client, user.id);
  if (!overview.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load Work</p>
        <p className="text-body text-ink-muted">{overview.error.message}</p>
        <Link href="/life" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to Life
        </Link>
      </main>
    );
  }

  const active = overview.data.pipeline.active.length;
  const blocked = overview.data.pipeline.blocked.length;

  return (
    <main className="mx-auto flex w-full max-w-report flex-1 flex-col gap-8 px-8 py-10">
      <Aurora band={null} />
      <PageHeader
        title="Work"
        context={
          active + blocked === 0
            ? "Nothing in the pipeline"
            : `${active} active · ${blocked} blocked`
        }
      />
      <WorkClient overview={overview.data} />
    </main>
  );
}
