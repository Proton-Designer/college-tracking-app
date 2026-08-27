import Link from "next/link";
import { listWorries } from "@collegeos/api";
import { Aurora, PageHeader } from "@/components/ui";
import { WorriesClient } from "@/components/worries/WorriesClient";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The Worry List, web port — BLUEPRINT Part IV-B. A capture inbox all week; Monday Hour 1
 * clears it.
 *
 * Capture is deliberately the cheapest write in the app: one field, one button, no
 * categorisation, no due date.
 */
export default async function WorriesPage() {
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

  const worriesResult = await listWorries(client, user.id);
  if (!worriesResult.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load the Worry List</p>
        <p className="text-body text-ink-muted">{worriesResult.error.message}</p>
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
        title="Worry List"
        context="Park it here, keep working. Monday's first Hour clears the list."
      />
      <WorriesClient initialWorries={worriesResult.data} />
    </main>
  );
}
