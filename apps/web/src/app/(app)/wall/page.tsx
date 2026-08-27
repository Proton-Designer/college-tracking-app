import Link from "next/link";
import { listWall } from "@collegeos/api";
import { Aurora, PageHeader } from "@/components/ui";
import { WallClient } from "@/components/wall/WallClient";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The Wall, web port -- every completed Hour as a tile, newest first.
 *
 * Completed Hours only, by design: the Wall is the product's proof surface, and the
 * blueprint is explicit that it must only ever grow and never read as debt. An abandoned
 * Hour is absent rather than shown struck through.
 */
export default async function WallPage() {
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

  const wallResult = await listWall(client, user.id);
  if (!wallResult.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load the Wall</p>
        <p className="text-body text-ink-muted">{wallResult.error.message}</p>
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
        title="The Wall"
        context="Every Hour you finished. It only ever grows — nothing here can be lost by a bad day."
      />
      <WallClient initialPage={wallResult.data} />
    </main>
  );
}
