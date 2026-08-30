import Link from "next/link";
import { loadFitnessOverview } from "@collegeos/api";
import { CYCLE_LENGTH_DAYS } from "@collegeos/core";
import { Aurora, PageHeader } from "@/components/ui";
import { FitnessClient } from "@/components/fitness/FitnessClient";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The Fitness surface, web.
 *
 * **Nothing here computes.** `loadFitnessOverview` calls `packages/core`'s fitness engine —
 * `cycleForDate` for the header, `weekStrip` for the Sun–Sat row, `volumeByMuscle` for the
 * per-muscle credit, `cycleProgress` for the deltas — and hands back finished values; this
 * file fetches and lays out. Mobile's `apps/mobile/src/app/fitness.tsx` calls the same
 * function, which is what stops the two platforms from disagreeing about how many sets a week
 * contained.
 *
 * **Empty is the default state, for all three users** (D40): no cycle anchor, no plan, no
 * exercises, nothing logged. Every one of those is handled inside `FitnessClient` as an
 * invitation with the form attached, never as a zero and never as seeded data — migration 52
 * deliberately does not port LifeOS's three starter plans, because they encode one person's
 * rep targets and are not anyone else's.
 */
export default async function FitnessPage() {
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

  const overview = await loadFitnessOverview(client, user.id);
  if (!overview.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load Fitness</p>
        <p className="text-body text-ink-muted">{overview.error.message}</p>
        <Link href="/life" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to Life
        </Link>
      </main>
    );
  }

  const { cycle, activePlan } = overview.data;

  return (
    <main className="mx-auto flex w-full max-w-report flex-1 flex-col gap-8 px-8 py-10">
      <Aurora band={null} />
      <PageHeader
        title="Fitness"
        context={
          cycle
            ? `Cycle ${cycle.cycleNumber} · day ${cycle.dayOfCycle} of ${CYCLE_LENGTH_DAYS}`
            : (activePlan?.name ?? "No cycle started")
        }
      />
      <FitnessClient overview={overview.data} />
    </main>
  );
}
