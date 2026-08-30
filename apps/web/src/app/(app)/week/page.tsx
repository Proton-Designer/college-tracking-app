import Link from "next/link";
import {
  getOwnProfile,
  getUserLocalToday,
  loadScreenTimeSeries,
  loadUnanchoredDrift,
  loadWeekReviewData,
} from "@collegeos/api";
import { addDays, computeWeekReview, driftLine, startOfWeek } from "@collegeos/core";
import { Aurora, PageHeader } from "@/components/ui";
import { UnanchoredDriftLine } from "@/components/vision/UnanchoredDriftLine";
import { WeeklySeries } from "@/components/review/ScreenTimeStep";
import { WeekReview } from "@/components/week/WeekReview";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The Sunday Review, web port — the week's Hours by category, the distraction Pareto, and
 * efficiency per day.
 *
 * The window is the current local week (Sunday-anchored, via core's `startOfWeek`), derived
 * from the profile timezone rather than from the server's clock: the week a user is living
 * in is a local-day question, and deriving it from UTC would roll the boundary a day early
 * for anyone west of Greenwich (B4).
 */
export default async function WeekPage() {
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
  const fromDate = startOfWeek(today);
  const toDate = addDays(fromDate, 6);

  const dataResult = await loadWeekReviewData(client, user.id, fromDate, toDate);
  if (!dataResult.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">
          Couldn&apos;t load the week
        </p>
        <p className="text-body text-ink-muted">{dataResult.error.message}</p>
        <Link href="/today" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to Today
        </Link>
      </main>
    );
  }

  // All arithmetic lives in core. This page decides the window and renders; it computes
  // nothing, so the web and mobile reviews cannot disagree about the same week.
  const review = computeWeekReview(dataResult.data.hourRows, dataResult.data.causes, dataResult.data.dayFacts);

  // D48's drift line, over the same Sunday-anchored week the rest of this page reads. A failed
  // read drops the panel rather than the page: the week's Hours are still worth reading without
  // it, and an error banner over a review is worse than a section that is simply absent.
  const driftResult = await loadUnanchoredDrift(client, user.id, { from: fromDate, to: toDate });

  // Same posture as the drift panel above: a failed read drops the section rather than the page.
  const seriesResult = await loadScreenTimeSeries(client, user.id, fromDate);

  return (
    <main className="mx-auto flex w-full max-w-report flex-1 flex-col gap-8 px-8 py-10">
      <Aurora band={null} />
      <PageHeader
        title="The week"
        context="Where the Hours went, what broke them, and which days actually closed."
      />
      <WeekReview review={review} fromDate={fromDate} toDate={toDate} />
      {driftResult.ok ? (
        <UnanchoredDriftLine report={driftResult.data} line={driftLine(driftResult.data)} />
      ) : null}

      {/* The screen-time series sits BESIDE the Hours, which is where the directive asked for it
          and where it is legible: this page is already the place the week's time is accounted
          for. Uploading and confirming stay on /review — this is the read, not the ritual.

          Dropped entirely rather than rendered empty when nothing has ever been reported. A
          series with no points is not a chart with holes; it is a feature the user has not
          started, and an empty frame here would imply a gap where there is simply no history. */}
      {seriesResult.ok && seriesResult.data.summary.reportedWeeks > 0 ? (
        <WeeklySeries points={seriesResult.data.points} summary={seriesResult.data.summary} />
      ) : null}
    </main>
  );
}
