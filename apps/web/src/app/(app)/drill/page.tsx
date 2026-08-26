import Link from "next/link";
import { getOwnProfile, getUserLocalToday, loadQuestionBank } from "@collegeos/api";
import { Aurora, PageHeader } from "@/components/ui";
import { DrillClient } from "@/components/bank/DrillClient";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/** The daily drill, web port -- BLUEPRINT 5.4's queue, cross-course by due date so
 *  review arrives interleaved. Same trick as mobile: the calibration tap comes BEFORE
 *  the reveal, because confidence recorded after seeing the answer measures nothing. */
export default async function DrillPage() {
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
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-3 px-8 py-12">
        <p className="text-body text-ink-muted">{profileResult.error.message}</p>
      </main>
    );
  }
  const today = getUserLocalToday(profileResult.data.timezone, new Date());
  const bankResult = await loadQuestionBank(client, user.id, today, profileResult.data.timezone);

  if (!bankResult.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load the queue</p>
        <p className="text-body text-ink-muted">{bankResult.error.message}</p>
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
        title="Due today"
        context="Answer in your head first. The confidence tap before the reveal is the entire measurement."
      />
      <DrillClient
        initialQueue={bankResult.data.queue}
        courseCodeById={bankResult.data.courseCodeById}
      />
    </main>
  );
}
