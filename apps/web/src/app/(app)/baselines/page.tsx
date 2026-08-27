import Link from "next/link";
import { getOwnProfile } from "@collegeos/api";
import { Aurora, PageHeader } from "@/components/ui";
import { BaselinesClient } from "@/components/baselines/BaselinesClient";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Per-weekday baselines, web port -- BLUEPRINT Part II item 5: "four hours is the
 * baseline forever" only works if it fits the real schedule, so class-heavy days get a
 * lower bar and Day Won stays honest. Zero is a legal value (a deliberate rest day).
 *
 * Edits apply to days created FROM NOW ON: an existing day keeps the snapshot it
 * inherited (migration 38's rule), so changing Tuesday's standard tonight never
 * rewrites whether last Tuesday was Won.
 */
export default async function BaselinesPage() {
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

  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load your baselines</p>
        <p className="text-body text-ink-muted">{profileResult.error.message}</p>
        <Link href="/today" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to Today
        </Link>
      </main>
    );
  }

  const raw = profileResult.data.weekday_baselines as Record<string, unknown> | null;
  const initialMap: Record<string, number> = {};
  for (let iso = 1; iso <= 7; iso++) {
    const v = raw?.[String(iso)];
    if (typeof v === "number" && Number.isInteger(v) && v >= 0) initialMap[String(iso)] = v;
  }

  return (
    <main className="mx-auto flex w-full max-w-report flex-1 flex-col gap-8 px-8 py-10">
      <Aurora band={null} />
      <PageHeader
        title="Baselines"
        context="Hours each weekday needs for Day Won"
      />
      <BaselinesClient initialMap={initialMap} />
    </main>
  );
}
