import type { KillEventOutcome, KillHabitRow } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useState, useTransition } from "react";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { logKillEventForHabit } from "../../lib/todayActions";
import { Button, Panel } from "../ui";
import { useToast } from "../ui/ToastProvider";

/**
 * SCREEN_SPEC §1.6 — one tap to log an event. Deliberately NOT color-coded good/bad: the
 * bounce-back metric only works if a relapse gets logged as readily as a resist, and a
 * punishing UI is exactly what makes people stop logging the thing that matters most.
 */
export function KillListSection({ userId, habits }: { userId: string; habits: KillHabitRow[] }) {
  if (habits.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={textStyle("label", color.inkMuted)}>Kill list</Text>
      <View style={styles.list}>
        {habits.map((habit) => (
          <HabitRow key={habit.id} userId={userId} habit={habit} />
        ))}
      </View>
    </View>
  );
}

function HabitRow({ userId, habit }: { userId: string; habit: KillHabitRow }) {
  const toast = useToast();
  const [pending, setPending] = useState<KillEventOutcome | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleLog(outcome: KillEventOutcome) {
    setPending(outcome);
    startTransition(async () => {
      const result = await logKillEventForHabit(userId, habit.id, outcome);
      setPending(null);
      if (!result.ok) {
        toast.show(result.error ?? "Couldn't log that — try again.", "error");
        return;
      }
      toast.show("Logged.");
    });
  }

  return (
    <Panel style={styles.row}>
      <Text style={textStyle("body", color.ink)}>{habit.name}</Text>
      <View style={styles.actions}>
        <Button
          variant="secondary"
          loading={isPending && pending === "resisted"}
          disabled={isPending && pending !== "resisted"}
          onPress={() => handleLog("resisted")}
        >
          I resisted
        </Button>
        <Button
          variant="secondary"
          loading={isPending && pending === "relapsed"}
          disabled={isPending && pending !== "relapsed"}
          onPress={() => handleLog("relapsed")}
        >
          I gave in
        </Button>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space[3],
  },
  list: {
    gap: space[3],
  },
  row: {
    gap: space[3],
  },
  actions: {
    flexDirection: "row",
    gap: space[2],
  },
});
