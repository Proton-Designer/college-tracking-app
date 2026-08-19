import Link from "next/link";
import { Panel } from "@/components/ui";
import { ReviewForm } from "@/components/review/ReviewForm";
import { loadReviewData } from "./data";

export default async function ReviewPage() {
  const result = await loadReviewData();

  if (!result.ok) {
    return (
      <main className="mx-auto flex w-full max-w-report flex-1 flex-col items-start gap-3 px-8 py-12">
        <p className="font-mono text-label uppercase tracking-[0.1em] text-risk-critical">Couldn&apos;t load tonight&apos;s review</p>
        <p className="text-body text-ink-muted">{result.error}</p>
        <Link href="/review" className="font-mono text-body-s text-accent underline underline-offset-2">
          Try again
        </Link>
      </main>
    );
  }

  const { today, incompleteMits, existingReview, draft, draftCompletionPct, prediction } = result.data;

  return (
    <main className="mx-auto flex w-full max-w-report flex-1 flex-col gap-6 px-8 py-10">
      <h1 className="font-serif text-display-m font-semibold tracking-[-0.01em] text-ink">Night review</h1>

      {existingReview ? (
        <Panel className="flex flex-col gap-4">
          <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Already saved tonight</p>
          {existingReview.proud_text ? (
            <ReviewField label="What went well" value={existingReview.proud_text} />
          ) : null}
          {existingReview.went_wrong_text ? (
            <ReviewField label="What went wrong" value={existingReview.went_wrong_text} />
          ) : null}
          {existingReview.important_note_text ? (
            <ReviewField label="Anything important" value={existingReview.important_note_text} />
          ) : null}
          <p className="text-caption text-ink-faint">
            MITs {existingReview.mits_completed}/{existingReview.mits_planned} ·{" "}
            {existingReview.deep_work_actual_min != null ? `${existingReview.deep_work_actual_min} min deep work` : "no session data"}
          </p>
          {prediction && prediction.actual_completion_pct != null ? (
            <p className="font-mono text-caption text-ink-faint">
              Predicted {Math.round(prediction.predicted_completion_pct)}% · actual {Math.round(prediction.actual_completion_pct)}%
            </p>
          ) : null}
        </Panel>
      ) : (
        <ReviewForm today={today} incompleteMits={incompleteMits} draft={draft} draftCompletionPct={draftCompletionPct} prediction={prediction} />
      )}
    </main>
  );
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">{label}</span>
      <p className="text-body text-ink">{value}</p>
    </div>
  );
}
