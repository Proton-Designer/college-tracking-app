import type { FrictionCause, Task } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useState, useTransition } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ChipGroup } from "../ui";
import { textStyle } from "../../design/typography";
import { logFrictionForTask } from "../../lib/reviewActions";

const FRICTION_OPTIONS: { value: FrictionCause; label: string }[] = [
  { value: "underestimated_duration", label: "Underestimated duration" },
  { value: "unclear_next_action", label: "Didn't know next step" },
  { value: "distracted", label: "Distracted" },
  { value: "tired", label: "Tired" },
  { value: "schedule_changed", label: "Schedule changed" },
  { value: "avoided_task", label: "Avoided discomfort" },
  { value: "higher_priority_appeared", label: "Higher priority appeared" },
  { value: "other", label: "Other" },
];

/** One-tap per incomplete MIT — logged immediately on tap, independent of whether the
 *  reflection form below it ever submits. Mirrors web's FrictionPicker exactly. */
export function FrictionPicker({ userId, task }: { userId: string; task: Task }) {
  const [selected, setSelected] = useState<FrictionCause | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSelect(value: string) {
    const cause = value as FrictionCause;
    setSelected(cause);
    setError(null);
    startTransition(async () => {
      const result = await logFrictionForTask(userId, task.id, cause);
      if (!result.ok) {
        setSelected(null);
        setError(result.error ?? "Couldn't save — try again.");
      }
    });
  }

  return (
    <View style={styles.row}>
      <Text style={textStyle("bodyS", color.ink)}>{task.title}</Text>
      <ChipGroup label="Why?" options={FRICTION_OPTIONS} value={selected} onValueChange={handleSelect} disabled={isPending} />
      {error ? <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: space[2],
  },
});
