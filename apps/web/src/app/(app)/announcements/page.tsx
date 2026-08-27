import Link from "next/link";
import { listCourses, listReviewableAnnouncements } from "@collegeos/api";
import { Aurora, PageHeader } from "@/components/ui";
import { AnnouncementsClient } from "@/components/announcements/AnnouncementsClient";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The announcement worklist, web port -- everything staged (polled from Canvas, or
 * pasted and abandoned mid-review) that still needs a human. `listReviewableAnnouncements`
 * is deliberately narrower than "every announcement": applied/rejected/no-schedulable-
 * content rows are done and stay out (S5's rule -- nothing the system defers may be
 * silent, but this is a worklist, not history; per-course history lives on course detail).
 */
export default async function AnnouncementsPage() {
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

  const [itemsResult, coursesResult] = await Promise.all([
    listReviewableAnnouncements(client, user.id),
    listCourses(client, { includeArchived: true }),
  ]);
  if (!itemsResult.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load announcements</p>
        <p className="text-body text-ink-muted">{itemsResult.error.message}</p>
        <Link href="/today" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to Today
        </Link>
      </main>
    );
  }

  const courseCodeById = Object.fromEntries((coursesResult.ok ? coursesResult.data : []).map((c) => [c.id, c.code]));

  return (
    <main className="mx-auto flex w-full max-w-report flex-1 flex-col gap-8 px-8 py-10">
      <Aurora band={null} />
      <PageHeader title="Announcements" context="Staged, not applied — every change still goes through your confirmation" />
      <AnnouncementsClient items={itemsResult.data} courseCodeById={courseCodeById} />
    </main>
  );
}
