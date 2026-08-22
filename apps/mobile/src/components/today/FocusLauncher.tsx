import type { TaskSessionRow } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useState, useTransition } from "react";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { startFocus } from "../../lib/todayActions";
import { Button, Panel } from "../ui";
import { useToast } from "../ui/ToastProvider";

export interface FocusBlock {
  taskId: number;
  title: string;
  courseCode: string | null;
  calibratedMinutes: number;
  location: string | null;
  /** Real minutes already logged against this task today (ended focus sessions only --
   *  never a fabricated or rounded-up figure). `null`, not 0, when nothing's logged yet;
   *  a session that hasn't happened and one that logged zero minutes are different facts. */
  loggedMinutesToday: number | null;
}

/**
 * SCREEN_SPEC §1.7 — "Start focus" with the pre-selected highest-value block. No
 * app-block/allow list: this product has no real blocking capability, and implying
 * enforcement that isn't happening would be dishonest UI.
 */
export function FocusLauncher({
  userId,
  block,
  activeSession,
}: {
  userId: string;
  block: FocusBlock | null;
  activeSession: TaskSessionRow | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (activeSession) {
    return (
      <View style={styles.section}>
        <Text style={textStyle("label", color.inkMuted)}>Focus</Text>
        <Panel style={styles.row}>
          <Text style={[textStyle("body", color.ink), styles.flexText]}>A focus session is already running.</Text>
          <Button variant="primary" onPress={() => router.push(`/focus/${activeSession.id}`)}>
            Resume focus
          </Button>
        </Panel>
      </View>
    );
  }

  if (!block) return null;

  function handleStart() {
    if (!block) return;
    setError(null);
    startTransition(async () => {
      const result = await startFocus(userId, block.taskId, block.calibratedMinutes, block.location ?? undefined);
      if (!result.ok || result.sessionId == null) {
        const message = result.error ?? "Couldn't start that session — try again.";
        setError(message);
        toast.show(message, "error");
        return;
      }
      router.push(`/focus/${result.sessionId}`);
    });
  }

  return (
    <View style={styles.section}>
      <Text style={textStyle("label", color.inkMuted)}>Focus</Text>
      <Panel style={styles.row}>
        <View style={styles.flexText}>
          <Text style={textStyle("body", color.ink)}>
            {block.title}
            {block.courseCode ? <Text style={textStyle("body", color.inkFaint)}> · {block.courseCode}</Text> : null}
          </Text>
          <Text style={textStyle("caption", color.inkFaint)}>
            {block.calibratedMinutes} min
            {block.loggedMinutesToday != null ? ` · ${block.loggedMinutesToday} min logged today` : ""}
          </Text>
        </View>
        <Button variant="primary" loading={isPending} onPress={handleStart}>
          Start focus
        </Button>
      </Panel>
      {error ? <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: space[3],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[4],
  },
  flexText: {
    flex: 1,
    gap: 2,
  },
});
