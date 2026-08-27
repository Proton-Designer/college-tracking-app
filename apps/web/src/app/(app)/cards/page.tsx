import Link from "next/link";
import { listCards } from "@collegeos/api";
import { Aurora, PageHeader } from "@/components/ui";
import { CardsClient } from "@/components/cards/CardsClient";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The Cards library, web port — BLUEPRINT Part IV-C. Replaces printing and posting documents
 * on a wall while keeping the read-it-again mechanic: cards surface in rotation at
 * End-of-Hour (packages/core's `pickRotation`), and are edited here.
 */
export default async function CardsPage() {
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

  const cardsResult = await listCards(client, user.id);
  if (!cardsResult.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load Cards</p>
        <p className="text-body text-ink-muted">{cardsResult.error.message}</p>
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
        title="Cards"
        context="Your wall, digitized. Three of these rotate at the end of every Hour."
      />
      <CardsClient initialCards={cardsResult.data} />
    </main>
  );
}
