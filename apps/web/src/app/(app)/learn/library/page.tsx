import Link from "next/link";
import { loadLibrary } from "@collegeos/api";
import { EmptyState, PageHeader, Panel } from "@/components/ui";
import { getServerSupabaseClient } from "@/lib/supabase/server";

/**
 * The source library, with memory strength per source.
 *
 * Strength is FSRS retrievability averaged across a source's reviewed cards — the brief's
 * "watch yourself beat the forgetting curve". A source whose cards have never been reviewed shows
 * **no bar at all**, not 0%: an untouched book has no retention to report, and a zero beside it
 * would read as failure at something never attempted (D40).
 */

const STEP_LABELS: Record<string, string> = {
  queued: "Queued",
  extracting_text: "Reading the text",
  parsing_structure: "Finding the chapters",
  chunking: "Splitting into passages",
  embedding: "Indexing",
  extracting_lessons: "Extracting lessons",
  merging: "Merging and ranking",
  generating_cards: "Writing the cards",
  done: "Ready",
  failed: "Failed",
};

export default async function LibraryPage() {
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

  // Retention is no longer a read-path parameter: every card's schedule was computed with the
  // retention in force at the moment of the review and is stored alongside it (D47).
  const library = await loadLibrary(client, user.id);

  if (!library.ok) {
    return (
      <main className="mx-auto flex w-full max-w-app flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">
          Couldn&apos;t load the library
        </p>
        <p className="text-body text-ink-muted">{library.error.message}</p>
      </main>
    );
  }

  const entries = library.data;

  return (
    <main className="mx-auto flex w-full max-w-app flex-1 flex-col gap-6 px-8 py-12">
      <PageHeader
        title="Library"
        actions={
          <Link href="/learn" className="font-mono text-body-s text-accent underline underline-offset-2">
            Today&apos;s session
          </Link>
        }
      />

      {entries.length === 0 ? (
        <Panel>
          <EmptyState
            title="No sources yet"
            description="Upload a book, an article or a talk. Ihsan reads it once, pulls out the lessons that are actually actionable, and keeps every one of them tied to the passage it came from — so you can always check what the author really said."
          />
        </Panel>
      ) : (
        <div className="flex flex-col gap-3">
          {entries.map((entry) => {
            const strengthPct = entry.strength === null ? null : Math.round(entry.strength * 100);
            const step = entry.job?.step ?? null;
            const processing = entry.source.status === "processing" || (step != null && step !== "done" && step !== "failed");

            return (
              <Panel key={entry.source.id}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="font-sans text-title font-semibold text-ink">{entry.source.title}</p>
                    {entry.source.author ? (
                      <p className="text-body-s text-ink-muted">{entry.source.author}</p>
                    ) : null}
                    <p className="font-mono text-caption text-ink-faint">
                      {entry.lessonCount > 0
                        ? `${entry.lessonCount} ${entry.lessonCount === 1 ? "lesson" : "lessons"}`
                        : "No lessons yet"}
                      {entry.source.page_count != null ? ` · ${entry.source.page_count} pages` : ""}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {entry.source.status === "failed" || step === "failed" ? (
                      <>
                        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">
                          Failed
                        </p>
                        {entry.job?.last_error ? (
                          <p className="max-w-[32ch] text-right text-body-s text-ink-muted">
                            {entry.job.last_error}
                          </p>
                        ) : null}
                      </>
                    ) : processing ? (
                      <>
                        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">
                          {step ? (STEP_LABELS[step] ?? "Working") : "Working"}
                        </p>
                        <p className="text-body-s text-ink-muted">This runs on the server; you can leave.</p>
                      </>
                    ) : strengthPct === null ? (
                      <>
                        {/* No bar, not a 0% bar. Nothing has been reviewed, so there is no
                            retention to report. */}
                        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-faint">
                          Memory strength
                        </p>
                        <p className="font-mono text-metric text-ink-faint">—</p>
                        <p className="text-body-s text-ink-muted">Not reviewed yet</p>
                      </>
                    ) : (
                      <>
                        <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-faint">
                          Memory strength
                        </p>
                        <p className="font-mono text-metric tabular-nums text-ink">{strengthPct}%</p>
                        <div
                          className="h-1.5 w-32 overflow-hidden rounded-pill bg-surface-sunken"
                          role="img"
                          aria-label={`Memory strength ${strengthPct} percent`}
                        >
                          <div
                            className="h-full rounded-pill bg-domain-fitness"
                            style={{ width: `${Math.max(2, strengthPct)}%` }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </main>
  );
}
