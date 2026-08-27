import Link from "next/link";
import { getActiveFocusSession, listDistractionsForSession, type DistractionRow } from "@collegeos/api";
import { Aurora, PageHeader } from "@/components/ui";
import { HourClient } from "@/components/hour/HourClient";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The Deep Work Hour, web port — BLUEPRINT 5.3's execution unit.
 *
 * Hours live in `task_sessions` with a non-null `hour_index` (ruling C1), which is what
 * keeps an Hour count from ever being inflated by ordinary historical task sessions. An
 * Hour with no `hour_index` is not an Hour.
 */
export default async function HourPage() {
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

  const activeResult = await getActiveFocusSession(client, user.id);
  if (!activeResult.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load the Hour</p>
        <p className="text-body text-ink-muted">{activeResult.error.message}</p>
        <Link href="/today" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to Today
        </Link>
      </main>
    );
  }

  // Only a session carrying an hour_index is an Hour — an ordinary focus session on a task
  // is a different thing and must not be adopted by this screen.
  const active = activeResult.data != null && activeResult.data.hour_index != null ? activeResult.data : null;

  let distractions: DistractionRow[] = [];
  if (active != null) {
    const distractionResult = await listDistractionsForSession(client, user.id, active.id);
    if (distractionResult.ok) distractions = distractionResult.data;
  }

  return (
    <main className="mx-auto flex w-full max-w-report flex-1 flex-col gap-8 px-8 py-10">
      <Aurora band={null} />
      <PageHeader
        title={active != null ? "Hour in progress" : "Start an Hour"}
        context="One block, one output. The distraction taps are the measurement, not a scolding."
      />
      <HourClient activeHour={active} distractions={distractions} />
    </main>
  );
}
