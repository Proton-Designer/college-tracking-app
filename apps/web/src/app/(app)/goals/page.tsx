import Link from "next/link";
import { getOwnProfile, getUserLocalToday, listGoalsWithMilestones, monthOf } from "@collegeos/api";
import { Aurora, PageHeader } from "@/components/ui";
import { GoalsClient } from "@/components/goals/GoalsClient";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The War Map, web port -- BLUEPRINT IV-B. Five goals, one monthly milestone each. No
 * annual grid, deliberately: the blueprint calls the full version "a spreadsheet
 * cosplaying as software" and this screen takes its side.
 *
 * The month key comes from the user's LOCAL today (B4) -- a milestone set at 11pm on
 * the 31st belongs to the month the user is standing in, not UTC's.
 */
export default async function GoalsPage() {
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
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load the War Map</p>
        <p className="text-body text-ink-muted">{profileResult.error.message}</p>
        <Link href="/today" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to Today
        </Link>
      </main>
    );
  }

  const month = monthOf(getUserLocalToday(profileResult.data.timezone, new Date()));
  const goalsResult = await listGoalsWithMilestones(client, user.id, month);
  if (!goalsResult.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load the War Map</p>
        <p className="text-body text-ink-muted">{goalsResult.error.message}</p>
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
        title="War Map"
        context={`One milestone each, for ${month}`}
      />
      <GoalsClient initialEntries={goalsResult.data} month={month} />
    </main>
  );
}
