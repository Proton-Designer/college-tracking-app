import type { DueQueueEntry } from "@collegeos/api";
import type { RetrievalConfidence } from "@collegeos/core";
import { color, radius, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Button, Panel } from "../components/ui";
import { textStyle } from "../design/typography";
import { answerQuestion, loadBank } from "../lib/bankActions";
import { useAuthSession } from "../lib/useAuthSession";

/**
 * The daily drill -- BLUEPRINT 5.4's queue, cross-course by due date so review arrives
 * interleaved. The calibration tap comes BEFORE the reveal, which is the entire trick:
 * confidence recorded after seeing the answer measures nothing.
 *
 * The verdict is self-graded against the shown answer AND its source anchor -- the
 * anchor is on screen at reveal precisely so "check the actual material" is one glance,
 * not a separate act of virtue.
 */
export default function DrillScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session: authSession } = useAuthSession();
  const userId = authSession?.user.id ?? null;

  const [queue, setQueue] = useState<DueQueueEntry[]>([]);
  const [courseCodeById, setCourseCodeById] = useState<Record<number, string>>({});
  const [index, setIndex] = useState(0);
  const [confidence, setConfidence] = useState<RetrievalConfidence | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [done, setDone] = useState({ answered: 0, correct: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userId == null) return;
    void loadBank(userId).then((r) => {
      if (r.ok) {
        setQueue(r.data.queue);
        setCourseCodeById(r.data.courseCodeById);
      } else setError(r.error);
      setLoading(false);
    });
  }, [userId]);

  const current = queue[index] ?? null;

  const onConfidence = useCallback((c: RetrievalConfidence) => {
    setConfidence(c);
    setRevealed(true);
  }, []);

  const onVerdict = useCallback(
    async (correct: boolean) => {
      if (userId == null || current == null || confidence == null) return;
      const result = await answerQuestion(userId, current.question.id, confidence, correct);
      if (!result.ok) {
        setError(result.error ?? "Could not record that answer.");
        return;
      }
      setDone((d) => ({ answered: d.answered + 1, correct: d.correct + (correct ? 1 : 0) }));
      setConfidence(null);
      setRevealed(false);
      setIndex((i) => i + 1);
    },
    [userId, current, confidence],
  );

  return (
    <View style={styles.screen}>
      <Aurora band={null} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[8] },
        ]}
      >
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={textStyle("bodyS", color.inkMuted)}>← Back</Text>
        </Pressable>

        <Text style={textStyle("displayM", color.ink)}>Due today</Text>
        {queue.length > 0 ? (
          <Text style={textStyle("label", color.inkMuted)}>
            {Math.min(index + 1, queue.length)} of {queue.length}
            {current?.item.weighted ? " · weighted up — recent sure-but-wrong on this topic" : ""}
          </Text>
        ) : null}

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        {loading ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>Loading…</Text>
        ) : current == null ? (
          <Panel>
            <Text style={textStyle("bodyL", color.ink)}>
              {done.answered > 0 ? `Queue clear — ${done.correct} of ${done.answered} right.` : "Nothing due."}
            </Text>
            <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
              {done.answered > 0
                ? "Done is done. The next cards surface when they're due."
                : "Write questions after today's reading and they'll queue themselves."}
            </Text>
            <View style={styles.spacedTop}>
              <Button variant="secondary" onPress={() => router.back()}>
                Done
              </Button>
            </View>
          </Panel>
        ) : (
          <>
            <Panel>
              <Text style={textStyle("label", color.inkMuted)}>
                {courseCodeById[current.question.course_id] ?? `Course #${current.question.course_id}`}
                {current.question.topic != null ? ` · ${current.question.topic}` : ""}
              </Text>
              <Text style={[textStyle("bodyL", color.ink), styles.spacedTop]}>{current.question.prompt}</Text>
              {!revealed ? (
                <>
                  <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
                    Answer it in your head first. How sure are you?
                  </Text>
                  <View style={styles.confidenceRow}>
                    {(
                      [
                        ["sure", "Sure"],
                        ["thinkso", "Think so"],
                        ["guessing", "Guessing"],
                      ] as const
                    ).map(([value, label]) => (
                      <Pressable
                        key={value}
                        onPress={() => onConfidence(value)}
                        accessibilityRole="button"
                        style={styles.confidenceChip}
                      >
                        <Text style={textStyle("body", color.ink)}>{label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : (
                <>
                  <View style={styles.answerBlock}>
                    <Text style={textStyle("body", color.ink)}>{current.question.answer}</Text>
                    <Text style={[textStyle("bodyS", color.inkFaint), styles.spacedTop]}>
                      {current.question.source_anchor != null
                        ? `Check it: ${current.question.source_anchor}`
                        : "No source recorded for this one."}
                    </Text>
                  </View>
                  <View style={styles.verdictRow}>
                    <View style={styles.verdictButton}>
                      <Button onPress={() => void onVerdict(true)}>Right</Button>
                    </View>
                    <View style={styles.verdictButton}>
                      <Button variant="secondary" onPress={() => void onVerdict(false)}>
                        Wrong
                      </Button>
                    </View>
                  </View>
                </>
              )}
            </Panel>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space[5], gap: space[4] },
  spacedTop: { marginTop: space[3] },
  confidenceRow: { flexDirection: "row", gap: space[3], marginTop: space[4] },
  confidenceChip: {
    flex: 1,
    alignItems: "center",
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.md,
    paddingVertical: space[4],
  },
  answerBlock: {
    marginTop: space[4],
    borderTopWidth: 1,
    borderTopColor: color.hairline,
    paddingTop: space[4],
  },
  verdictRow: { flexDirection: "row", gap: space[3], marginTop: space[4] },
  verdictButton: { flex: 1 },
});
