import Link from "next/link";
import {
  buildWindowsForDay,
  getOwnProfile,
  getUserLocalToday,
  listHoursForDate,
  listTasksForDate,
  loadDaySignal,
} from "@collegeos/api";
import { addDays, localTimeToInstant, type EvidenceSpan } from "@collegeos/core";
import { Aurora, PageHeader } from "@/components/ui";
import { NightPlanClient } from "@/components/nightplan/NightPlanClient";
import { UnaccountedGaps } from "@/components/signal/UnaccountedGaps";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The Night Plan, web port — dump, star three, crown the MIT, close the day.
 *
 * The plan targets the user's local tomorrow, derived from the profile timezone. Someone
 * planning at half past midnight is still planning for the day they think of as tomorrow;
 * a UTC-derived boundary would file it a day out (B4).
 */
export default async function NightPlanPage() {
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
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">
          Couldn&apos;t load the plan
        </p>
        <p className="text-body text-ink-muted">{profileResult.error.message}</p>
        <Link href="/today" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to Today
        </Link>
      </main>
    );
  }

  const today = getUserLocalToday(profileResult.data.timezone, new Date());
  const plannedDate = addDays(today, 1);

  // Anything already planned for tomorrow seeds the dump, so re-opening the Night Plan
  // doesn't ask the user to retype what they already filed. A failed read degrades to an
  // empty dump rather than an error page — the plan is still writable without it.
  const existingResult = await listTasksForDate(client, plannedDate);
  const existingTitles = existingResult.ok ? existingResult.data.map((t) => t.title) : [];

  // D33's boundary, assembled here and nowhere else: the ONLY thing allowed to pre-fill a window
  // is a source that already carries its own account of the time. A completed Hour has a
  // deliverable and a domain, so it accounts for its own span and is never asked about. Everything
  // else the day contains -- an app being open, a calendar entry, a plausible guess -- is
  // deliberately absent from this list, because inference is what would turn Signal:Noise into an
  // activity log wearing its name.
  const profile = profileResult.data;
  const hoursResult = await listHoursForDate(client, user.id, today);
  const evidence: EvidenceSpan[] = hoursResult.ok
    ? hoursResult.data
        .filter((hour) => hour.actual_start !== null && hour.actual_duration_min !== null)
        .map((hour) => ({
          start: hour.actual_start as string,
          end: new Date(
            Date.parse(hour.actual_start as string) + (hour.actual_duration_min as number) * 60_000,
          ).toISOString(),
          domain: hour.domain,
          source: hour.deliverable ? `Hour — ${hour.deliverable}` : "Hour",
        }))
    : [];

  const windows = buildWindowsForDay(
    {
      checkinWindowStart: profile.checkin_window_start,
      checkinWindowEnd: profile.checkin_window_end,
      checkinIntervalMinutes: profile.checkin_interval_minutes,
    },
    today,
    profile.timezone,
    localTimeToInstant,
  );

  const signal =
    windows.length > 0
      ? await loadDaySignal(client, user.id, {
          localDate: today,
          windows,
          evidence,
          signalDomains: profile.signal_domains,
          windowMinutes: profile.checkin_interval_minutes,
        })
      : null;

  return (
    <main className="mx-auto flex w-full max-w-report flex-1 flex-col gap-8 px-8 py-10">
      <Aurora band={null} />
      <PageHeader
        title="Night Plan"
        context={`Closing out today and setting up ${plannedDate}.`}
      />
      {signal?.ok ? (
        <UnaccountedGaps
          view={signal.data}
          windowMinutes={profile.checkin_interval_minutes}
          timeZone={profile.timezone}
        />
      ) : null}
      <NightPlanClient plannedDate={plannedDate} existingTitles={existingTitles} />
    </main>
  );
}
