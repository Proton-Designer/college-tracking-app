import Link from "next/link";
import { getAnnouncement, listDeliverables } from "@collegeos/api";
import { Aurora, PageHeader } from "@/components/ui";
import { AnnouncementDetailClient } from "@/components/announcements/AnnouncementDetailClient";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * One staged announcement: the diff review and the confirm gate. This is the ONLY
 * screen an "applying a diff" action can happen from -- see announcementActions.ts's
 * header for the property this guarantees. Reachable from the worklist's "Review
 * changes" button on a 'parsed' row; a non-'parsed' row (pending/failed/applied/
 * rejected/no_schedulable_content) renders a read-only status instead of the editor.
 */
export default async function AnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const announcementId = Number(id);

  if (!Number.isInteger(announcementId)) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-3 px-8 py-12">
        <p className="text-body text-ink-muted">Not a valid announcement.</p>
      </main>
    );
  }

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

  const result = await getAnnouncement(client, user.id, announcementId);
  if (!result.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load that announcement</p>
        <p className="text-body text-ink-muted">{result.error.message}</p>
        <Link href="/announcements" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to Announcements
        </Link>
      </main>
    );
  }
  if (result.data == null) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="text-body text-ink-muted">That announcement could not be found.</p>
        <Link href="/announcements" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to Announcements
        </Link>
      </main>
    );
  }
  const announcement = result.data;

  // Open deliverable titles, for the matched-title Select on date_change rows -- only
  // needed while there is a diff to edit.
  let titles: string[] = [];
  if (announcement.status === "parsed") {
    const deliverablesResult = await listDeliverables(client, announcement.course_id);
    if (deliverablesResult.ok) titles = deliverablesResult.data.filter((d) => d.status !== "completed").map((d) => d.title);
  }

  return (
    <main className="mx-auto flex w-full max-w-report flex-1 flex-col gap-8 px-8 py-10">
      <Aurora band={null} />
      <div className="flex flex-col gap-1">
        <Link href="/announcements" className="font-mono text-caption uppercase tracking-[0.08em] text-ink-faint hover:text-ink">
          ← Announcements
        </Link>
        <PageHeader title="Announcement" />
      </div>
      <AnnouncementDetailClient announcement={announcement} titles={titles} />
    </main>
  );
}
