import type { DailyPredictionRow, NightReviewDraft } from "@collegeos/api";
import { Panel } from "@/components/ui";

function ReadoutRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="font-mono text-label uppercase tracking-[0.1em] text-ink-faint">{label}</span>
      <span className="font-mono text-body-s tabular-nums text-ink">{value}</span>
    </div>
  );
}

/** Auto-populated actuals — SCREEN_SPEC §3: "the user only adds what the system cannot
 *  know." Every value here comes from getNightReviewDraft, never from user input.
 *  A field is omitted entirely rather than shown as a fabricated zero when its source
 *  table has no row for today (no screen-time integration, no health sync, etc). */
export function ReviewDraft({
  draft,
  draftCompletionPct,
  prediction,
}: {
  draft: NightReviewDraft;
  draftCompletionPct: number;
  prediction: DailyPredictionRow | null;
}) {
  return (
    <Panel className="flex flex-col gap-3">
      <p className="font-mono text-label uppercase tracking-[0.1em] text-ink-muted">Tonight&apos;s numbers</p>
      <ReadoutRow label="MITs" value={`${draft.mitsCompleted}/${draft.mitsPlanned} completed`} />
      <ReadoutRow label="Deep work" value={`${draft.deepWorkActualMin} / ${draft.deepWorkPlannedMin} min`} />
      {draft.screenTimeMin != null ? (
        <ReadoutRow
          label="Screen time"
          value={
            draft.distractingTimeMin != null
              ? `${draft.screenTimeMin} min · ${draft.distractingTimeMin} min distracting`
              : `${draft.screenTimeMin} min`
          }
        />
      ) : null}
      {draft.workoutCompleted != null ? (
        <ReadoutRow label="Workout" value={draft.workoutCompleted ? "Done" : "Skipped"} />
      ) : null}
      {draft.killListTotal > 0 ? (
        <ReadoutRow label="Kill list" value={`${draft.killListSuccessCount}/${draft.killListTotal} resisted`} />
      ) : null}
      {prediction && prediction.predicted_completion_pct != null ? (
        <ReadoutRow
          label="Prediction"
          value={`predicted ${Math.round(prediction.predicted_completion_pct)}% · so far ${Math.round(draftCompletionPct)}%`}
        />
      ) : null}
    </Panel>
  );
}
