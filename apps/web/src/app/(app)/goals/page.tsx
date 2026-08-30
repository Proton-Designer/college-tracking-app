import Link from "next/link";
import {
  getOwnProfile,
  getUserLocalToday,
  listGoalsWithMilestones,
  loadGoalEcology,
  monthOf,
} from "@collegeos/api";
import { Aurora, PageHeader } from "@/components/ui";
import { GoalEcology } from "@/components/goals/GoalEcology";
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

  const today = getUserLocalToday(profileResult.data.timezone, new Date());
  const month = monthOf(today);
  // Both reads in parallel. Ecology is a second view of the same five goals, and it must not add
  // a serial round trip to the War Map's own load.
  const [goalsResult, ecologyResult] = await Promise.all([
    listGoalsWithMilestones(client, user.id, month),
    loadGoalEcology(client, user.id),
  ]);
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
      <GoalsClient
        initialEntries={goalsResult.data}
        month={month}
        scored={ecologyResult.ok ? ecologyResult.data.scored : []}
        today={today}
      />

      {/* D49. A hairline-and-eyebrow group, the same device /review uses to separate two halves of
          one page: the goals themselves, then how they interact. A failed ecology read drops this
          section rather than the page — the War Map is still worth reading without it. */}
      {ecologyResult.ok ? (
        <section className="flex flex-col gap-6 border-t border-hairline pt-8">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <h2 className="font-mono text-label uppercase tracking-[0.1em] text-ink">How these goals interact</h2>
            <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-faint">Every pair</p>
          </div>
          <GoalEcology view={ecologyResult.data} />
        </section>
      ) : null}
    </main>
  );
}
