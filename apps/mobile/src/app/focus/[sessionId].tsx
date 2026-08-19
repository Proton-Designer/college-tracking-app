import type { FocusSessionContext } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState, useTransition } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Panel, SegmentedControl, Skeleton, Textarea } from "../../components/ui";
import { textStyle } from "../../design/typography";
import { abandonFocus, completeFocus } from "../../lib/focusActions";
import { useAuthSession } from "../../lib/useAuthSession";
import { useFocusSessionData } from "../../lib/useFocusSessionData";

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * SCREEN_SPEC §8 — full-screen, deliberately sparse. Pushed outside the (tabs) group so
 * the tab bar disappears while focusing, same as Settings/Course Detail. No app-block
 * list -- no real blocking capability exists, and showing one would be dishonest.
 */
export default function FocusSessionScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session: authSession } = useAuthSession();
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const id = Number(sessionId);
  const result = useFocusSessionData(id);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[8] }]}
    >
      {!Number.isInteger(id) ? <Text style={textStyle("body", color.inkMuted)}>Not a valid focus session.</Text> : null}

      {Number.isInteger(id) && result.status === "loading" ? (
        <View style={{ gap: space[4], marginTop: space[9] }}>
          <Skeleton height={20} width={140} />
          <Skeleton height={40} width={260} />
          <Skeleton height={56} width={160} />
        </View>
      ) : null}

      {Number.isInteger(id) && result.status === "error" ? (
        <Text style={textStyle("label", color.riskCritical)}>{result.error}</Text>
      ) : null}

      {Number.isInteger(id) && result.status === "ready" && authSession?.user.id ? (
        result.data.session.status !== "active" ? (
          <Text style={textStyle("body", color.inkMuted)}>This focus session already ended.</Text>
        ) : (
          <FocusActive userId={authSession.user.id} data={result.data} onDone={() => router.replace("/today")} />
        )
      ) : null}
    </ScrollView>
  );
}

function FocusActive({
  userId,
  data,
  onDone,
}: {
  userId: string;
  data: FocusSessionContext;
  onDone: () => void;
}) {
  const { session, task, course } = data;
  const [now, setNow] = useState(() => Date.now());
  const [mode, setMode] = useState<"focusing" | "completing">("focusing");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [output, setOutput] = useState("");
  const [focusRating, setFocusRating] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const actualStart = session.actual_start ? new Date(session.actual_start).getTime() : now;
  const elapsedSeconds = Math.max(0, Math.floor((now - actualStart) / 1000));

  function handleAbandon() {
    setError(null);
    startTransition(async () => {
      const result = await abandonFocus(userId, session.id);
      if (!result.ok) {
        setError(result.error ?? "Couldn't end that session — try again.");
        return;
      }
      onDone();
    });
  }

  function handleComplete() {
    setError(null);
    startTransition(async () => {
      const result = await completeFocus(userId, session.id, {
        ...(focusRating != null ? { subjectiveFocus: focusRating } : {}),
        ...(output.trim() ? { objectiveOutput: output.trim() } : {}),
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't end that session — try again.");
        return;
      }
      onDone();
    });
  }

  if (mode === "completing") {
    return (
      <View style={styles.centerStack}>
        <Text style={textStyle("displayM", color.ink)}>How did that go?</Text>
        <Panel style={styles.completePanel}>
          <Textarea label="Actual output" value={output} onChangeText={setOutput} rows={2} />
          <SegmentedControl label="Focus" value={focusRating} onValueChange={setFocusRating} min={1} max={5} />
          {error ? <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text> : null}
          <Button variant="primary" loading={isPending} onPress={handleComplete}>
            Done
          </Button>
        </Panel>
      </View>
    );
  }

  return (
    <View style={[styles.centerStack, { marginTop: space[11] }]}>
      <View style={{ alignItems: "center", gap: 4 }}>
        <Text style={textStyle("label", color.inkMuted)}>{course ? `${course.code} focus` : "Focus"}</Text>
        <Text style={[textStyle("displayM", color.ink), { textAlign: "center" }]}>{task.title}</Text>
        {session.location ? <Text style={textStyle("bodyS", color.inkFaint)}>{session.location}</Text> : null}
      </View>

      <Text style={textStyle("metricXl", color.ink)}>{formatElapsed(elapsedSeconds)}</Text>

      {error ? <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text> : null}

      <View style={{ alignItems: "center", gap: space[3] }}>
        <Button variant="primary" onPress={() => setMode("completing")}>
          End session
        </Button>
        <Pressable onPress={handleAbandon} disabled={isPending} hitSlop={8}>
          <Text style={textStyle("caption", color.inkFaint)}>Abandon without reflecting</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: color.ground,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: space[5],
    justifyContent: "center",
  },
  centerStack: {
    alignItems: "center",
    gap: space[7],
  },
  completePanel: {
    width: "100%",
    gap: space[5],
  },
});
