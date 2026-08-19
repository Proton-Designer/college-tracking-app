import type { DailyPredictionRow, NightReviewDraft } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { StyleSheet, Text, View } from "react-native";
import { Panel } from "../ui";
import { textStyle } from "../../design/typography";

function ReadoutRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={textStyle("label", color.inkFaint)}>{label}</Text>
      <Text style={textStyle("bodyS", color.ink)}>{value}</Text>
    </View>
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
    <Panel style={styles.panel}>
      <Text style={textStyle("label", color.inkMuted)}>Tonight&apos;s numbers</Text>
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
      {prediction ? (
        <ReadoutRow
          label="Prediction"
          value={`predicted ${Math.round(prediction.predicted_completion_pct)}% · so far ${Math.round(draftCompletionPct)}%`}
        />
      ) : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: space[3],
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: space[4],
  },
});
