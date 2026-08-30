import Link from "next/link";
import { getOwnProfile, getUserLocalToday, loadVisionChain } from "@collegeos/api";
import { Aurora, PageHeader, Panel } from "@/components/ui";
import { MomReviewClient } from "@/components/vision/MomReviewClient";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The 90-day review ritual, its own surface (D48).
 *
 * Its own page rather than a section of `/review`: the weekly review is a ten-minute reading, and
 * this is a quarterly decision. Folding a decision into a reading surface is how a ritual becomes
 * something people skim. `/review` links here on the days it is due, and this page is reachable
 * directly at any time — closing early is legitimate, and the app has no business deciding when
 * ninety days are really over.
 *
 * When nothing is due, the page says so plainly instead of refusing: a screen that will not tell
 * you why you cannot be there is worse than one that shows you an empty ritual.
 */
export default async function MomReviewPage() {
  const client = await getServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) {
    return (
      <main className="mx-auto flex w-full max-w-report flex-1 flex-col gap-3 px-8 py-12">
        <p className="text-body text-ink-muted">Not signed in.</p>
      </main>
    );
  }

  const profileResult = await getOwnProfile(client);
  if (!profileResult.ok) {
    return (
      <main className="mx-auto flex w-full max-w-report flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">
          Couldn&apos;t load the review
        </p>
        <p className="text-body text-ink-muted">{profileResult.error.message}</p>
      </main>
    );
  }

  const today = getUserLocalToday(profileResult.data.timezone, new Date());
  const viewResult = await loadVisionChain(client, user.id, { today });

  if (!viewResult.ok) {
    return (
      <main className="mx-auto flex w-full max-w-report flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">
          Couldn&apos;t load the review
        </p>
        <p className="text-body text-ink-muted">{viewResult.error.message}</p>
        <Link href="/vision" className="font-mono text-body-s text-accent underline underline-offset-2">
          Back to the chain
        </Link>
      </main>
    );
  }

  const view = viewResult.data;

  return (
    <main className="mx-auto flex w-full max-w-report flex-1 flex-col gap-8 px-8 py-10">
      <Aurora band={null} />
      <PageHeader
        title="The 90-day review"
        context="Score the M.O.M. on its own terms, write what happened, and set the next one if you are ready to."
        actions={
          <Link href="/vision" className="font-mono text-body-s text-accent underline underline-offset-2">
            The chain →
          </Link>
        }
      />

      {view.activeMomReview != null ? (
        <Panel className="flex flex-col gap-2">
          <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
            Already reviewed on {view.activeMomReview.local_date}
          </p>
          <p className="text-body text-ink-muted">
            Saving again replaces what is written below. Nothing is lost by leaving this page.
          </p>
        </Panel>
      ) : null}

      <MomReviewClient view={view} />
    </main>
  );
}
