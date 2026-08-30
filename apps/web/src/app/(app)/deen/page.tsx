import Link from "next/link";
import { loadDeenOverview } from "@collegeos/api";
import { Aurora, PageHeader } from "@/components/ui";
import { DeenClient } from "@/components/deen/DeenClient";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The Deen surface, web. D30's four replacements for the prayer streak are the whole screen:
 * days cleared, on-time rate, the 30-day heatmap, and the qada backlog — plus the Qur'an,
 * adhkar, sunnah and reflection logs the module carries.
 *
 * **Nothing here computes.** `loadDeenOverview` calls `packages/core`'s prayer engine and
 * hands back resolved statuses, the bucketed backlog, the grid and the summary; this file
 * fetches and lays out. Mobile's `apps/mobile/src/app/deen.tsx` calls the same function, which
 * is what stops the two platforms from disagreeing about whether Asr was missed.
 *
 * **No location is the default state** for all three users (D40), and it is handled inside
 * `DeenClient`: prayer times render as "awaiting a time", the rate and days-cleared read "—",
 * and every one of them points at Settings. Logging still works — a person knows they prayed
 * whether or not this app knows when Maghrib was.
 */
export default async function DeenPage() {
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

  const overview = await loadDeenOverview(client, user.id);
  if (!overview.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load Deen</p>
        <p className="text-body text-ink-muted">{overview.error.message}</p>
        <Link href="/today" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to Today
        </Link>
      </main>
    );
  }

  const { location } = overview.data;

  return (
    <main className="mx-auto flex w-full max-w-report flex-1 flex-col gap-8 px-8 py-10">
      <Aurora band={null} />
      <PageHeader
        title="Deen"
        context={location ? (location.label ?? "Location set") : "No location set"}
      />
      <DeenClient overview={overview.data} />
    </main>
  );
}
