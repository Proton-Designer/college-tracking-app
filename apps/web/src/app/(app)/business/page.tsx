import Link from "next/link";
import { loadBusinessLens } from "@collegeos/api";
import { Aurora, PageHeader } from "@/components/ui";
import { BusinessClient } from "@/components/business/BusinessClient";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The Business surface, web.
 *
 * **A lens, not a store** (directive rule 3.4). Everything on this page already exists
 * somewhere else: today's MITs and the open work are `tasks`, the week's focus is
 * `weekly_goals` (the cadence layer every domain shares), the direction it steps down from is
 * a War Map milestone, and the Hours are `task_sessions` rows tagged `business`. Business owns
 * no table.
 *
 * **D37 is why the top panel reads `tasks.mit_rank`.** LifeOS's kill list and our MIT system
 * are the same idea at the same cardinality, and ours is DB-enforced. Two "today's three"
 * concepts in one app would be a second source of truth about the same question, so this page
 * shows the business-tagged slice of the day's MITs and never keeps its own.
 */
export default async function BusinessPage() {
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

  const lens = await loadBusinessLens(client, user.id);
  if (!lens.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load Business</p>
        <p className="text-body text-ink-muted">{lens.error.message}</p>
        <Link href="/life" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to Life
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-report flex-1 flex-col gap-8 px-8 py-10">
      <Aurora band={null} />
      <PageHeader
        title="Business"
        context={lens.data.weeklyGoal?.headline ?? "No focus set this week"}
      />
      <BusinessClient lens={lens.data} />
    </main>
  );
}
