import type { Task } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useState, useTransition } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Button, Panel, Textarea } from "../ui";
import { textStyle } from "../../design/typography";
import { submitReview } from "../../lib/reviewActions";
import { FrictionPicker } from "./FrictionPicker";

export function ReviewForm({
  userId,
  today,
  incompleteMits,
  onSaved,
}: {
  userId: string;
  today: string;
  incompleteMits: Task[];
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
      {incompleteMits.length > 0 ? (
        <Panel title="What got in the way?">
          <View style={styles.taskStack}>
            {incompleteMits.map((task, i) => (
              <View key={task.id} style={i < incompleteMits.length - 1 ? styles.divider : undefined}>
                <FrictionPicker userId={userId} task={task} />
              </View>
            ))}
          </View>
        </Panel>
      ) : null}

      <Panel style={styles.formPanel}>
        <Textarea label="What went well" value={proudText} onChangeText={setProudText} rows={3} />
        <Textarea label="What went wrong" value={wentWrongText} onChangeText={setWentWrongText} rows={3} />
        <Textarea label="Anything important" value={importantNoteText} onChangeText={setImportantNoteText} rows={3} />
        {error ? <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text> : null}
        <Button onPress={handleSubmit} loading={isPending}>
          Save review
        </Button>
      </Panel>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space[6],
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
