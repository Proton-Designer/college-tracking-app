import type { DailyPredictionRow, NightReviewDraft, Task } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useState, useTransition } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Panel, Textarea } from "../ui";
import { textStyle } from "../../design/typography";
import { submitReview } from "../../lib/reviewActions";
import { FrictionPicker } from "./FrictionPicker";
import { ReviewDraft } from "./ReviewDraft";

export function ReviewForm({
  userId,
  today,
  incompleteMits,
  draft,
  draftCompletionPct,
  prediction,
  onSaved,
}: {
  userId: string;
  today: string;
  incompleteMits: Task[];
  draft: NightReviewDraft;
  draftCompletionPct: number;
  prediction: DailyPredictionRow | null;
  onSaved: () => void;
}) {
  const [proudText, setProudText] = useState("");
  const [wentWrongText, setWentWrongText] = useState("");
  const [importantNoteText, setImportantNoteText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await submitReview({
        userId,
        localDate: today,
        ...(proudText.trim() ? { proudText: proudText.trim() } : {}),
        ...(wentWrongText.trim() ? { wentWrongText: wentWrongText.trim() } : {}),
        ...(importantNoteText.trim() ? { importantNoteText: importantNoteText.trim() } : {}),
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't save — try again.");
        return;
      }
      onSaved();
    });
  }

  return (
    <View style={styles.stack}>
      <ReviewDraft draft={draft} draftCompletionPct={draftCompletionPct} prediction={prediction} />

      {/* R2, mirroring web: the record leads, prose is the residue. This screen's job is not
          to collect a journal -- it's to let the measured day argue with the remembered one. */}
      {incompleteMits.length > 0 ? (
        <View style={styles.section}>
          <Text style={textStyle("label", color.inkMuted)}>What got in the way?</Text>
          <Panel>
            <View style={styles.taskStack}>
              {incompleteMits.map((task, i) => (
                <View key={task.id} style={i < incompleteMits.length - 1 ? styles.divider : undefined}>
                  <FrictionPicker userId={userId} task={task} />
                </View>
              ))}
            </View>
          </Panel>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={textStyle("label", color.inkMuted)}>In your own words</Text>
        <Text style={textStyle("bodyS", color.inkMuted)}>
          Optional. The numbers above are already recorded — this is for what they can&apos;t see.
        </Text>
        <Panel style={styles.formPanel}>
          <Textarea label="What went well" value={proudText} onChangeText={setProudText} rows={2} />
          <Textarea label="What went wrong" value={wentWrongText} onChangeText={setWentWrongText} rows={2} />
          <Textarea label="Anything important" value={importantNoteText} onChangeText={setImportantNoteText} rows={2} />
          {error ? <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text> : null}
          <Button onPress={handleSubmit} loading={isPending}>
            Save review
          </Button>
        </Panel>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space[6],
  },
  section: {
    gap: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
    paddingTop: space[5],
  },
  taskStack: {
    gap: space[4],
  },
  divider: {
    paddingBottom: space[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  formPanel: {
    gap: space[5],
  },
});
