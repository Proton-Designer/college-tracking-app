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
 *  table has no row for today (no screen-time integration, no health sync, etc).
 *
 *  MITs and deep work are the two rows that always render, because "you planned nothing"
 *  is a fact we genuinely know rather than a gap in a source table — so they say that,
 *  instead of "0/0 completed" and "0 / 0 min". A real zero and an absent value are
 *  different facts and must never render identically: `0/0 completed` reads as failure
 *  when it actually means there was nothing to fail at. Keep these in sync with the
 *  mobile copy of this component. */
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
      <ReadoutRow
        label="MITs"
        value={draft.mitsPlanned === 0 ? "none planned" : `${draft.mitsCompleted}/${draft.mitsPlanned} completed`}
      />
      <ReadoutRow
        label="Deep work"
        value={
          draft.deepWorkPlannedMin === 0
            ? draft.deepWorkActualMin === 0
              ? "none planned"
              : `${draft.deepWorkActualMin} min · unplanned`
            : `${draft.deepWorkActualMin} / ${draft.deepWorkPlannedMin} min`
        }
      />
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
