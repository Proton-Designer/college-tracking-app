import type { QuestionRow } from "@collegeos/api";
import { color, radius, space } from "@collegeos/design/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Button, Input, Panel, Textarea } from "../components/ui";
import { textStyle } from "../design/typography";
import { addQuestion, loadCourseQuestions, retireQuestionAction } from "../lib/bankActions";
import { useAuthSession } from "../lib/useAuthSession";

/**
 * The Question Bank, per course -- BLUEPRINT 5.4. Manual entry gets the best UX on
 * purpose: writing your own questions IS the study technique (the generation effect is
 * the highest-value source in 5.4's list), so the write path is first-class and the
 * anchor field sits beside the answer where it belongs, required-or-explicitly-skipped.
 */
export default function BankScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session: authSession } = useAuthSession();
  const userId = authSession?.user.id ?? null;
  const { courseId: courseIdParam } = useLocalSearchParams<{ courseId: string }>();
  const courseId = Number(courseIdParam);

  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [anchor, setAnchor] = useState("");
  const [anchorSkipped, setAnchorSkipped] = useState(false);
  const [topic, setTopic] = useState("");

  const refresh = useCallback(async () => {
    if (userId == null || !Number.isFinite(courseId)) return;
    const result = await loadCourseQuestions(userId, courseId);
    if (result.ok) setQuestions(result.data);
    else setError(result.error);
    setLoading(false);
  }, [userId, courseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onAdd = useCallback(async () => {
    if (userId == null) return;
    setBusy(true);
    setError(null);
    const result = await addQuestion(userId, {
      courseId,
      prompt,
      answer,
      ...(anchorSkipped ? { sourceSkipped: true } : { sourceAnchor: anchor }),
      ...(topic.trim() !== "" ? { topic } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not add the question.");
      return;
    }
    setPrompt("");
    setAnswer("");
    setAnchor("");
    setAnchorSkipped(false);
    // Topic is kept: writing a run of questions on one topic is the normal flow.
    await refresh();
  }, [userId, courseId, prompt, answer, anchor, anchorSkipped, topic, refresh]);

  const onRetire = useCallback(
    async (questionId: number) => {
      if (userId == null) return;
      const result = await retireQuestionAction(userId, questionId);
      if (!result.ok) setError(result.error ?? "Could not retire the question.");
      await refresh();
    },
    [userId, refresh],
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

        <Text style={textStyle("displayM", color.ink)}>Question Bank</Text>
        <Text style={textStyle("bodyS", color.inkMuted)}>
          Writing the question is half the studying. Anchor every answer to real material.
        </Text>

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        <Panel>
          <Text style={textStyle("label", color.inkMuted)}>New question</Text>
          <View style={styles.spacedTop}>
            <Textarea label="Prompt" value={prompt} onChangeText={setPrompt} editable={!busy} />
          </View>
          <View style={styles.spacedTop}>
            <Textarea label="Answer" value={answer} onChangeText={setAnswer} editable={!busy} />
          </View>
          <View style={styles.spacedTop}>
            {anchorSkipped ? (
              <Pressable onPress={() => setAnchorSkipped(false)} accessibilityRole="button">
                <Text style={textStyle("bodyS", color.inkMuted)}>
                  Source skipped — recorded, not forgotten. Tap to add one after all.
                </Text>
              </Pressable>
            ) : (
              <>
                <Input
                  label="Source anchor"
                  value={anchor}
                  onChangeText={setAnchor}
                  placeholder="p. 142 / slide 18 / lecture 2026-09-03"
                  editable={!busy}
                />
                <Pressable
                  onPress={() => setAnchorSkipped(true)}
                  accessibilityRole="button"
                  style={styles.skipLink}
                >
                  <Text style={textStyle("bodyS", color.inkFaint)}>No source for this one</Text>
                </Pressable>
              </>
            )}
          </View>
          <View style={styles.spacedTop}>
            <Input label="Topic (optional)" value={topic} onChangeText={setTopic} placeholder="sampling bias" editable={!busy} />
          </View>
          <View style={styles.spacedTop}>
            <Button
              onPress={onAdd}
              disabled={busy || prompt.trim() === "" || answer.trim() === "" || (!anchorSkipped && anchor.trim() === "")}
            >
              Add to the Bank
            </Button>
          </View>
        </Panel>

        {loading ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>Loading…</Text>
        ) : (
          questions.map((q) => (
            <View key={q.id} style={styles.row}>
              <View style={styles.rowBody}>
                <Text style={textStyle("body", color.ink)}>{q.prompt}</Text>
                <Text style={textStyle("bodyS", color.inkMuted)}>
                  {q.topic != null ? `${q.topic} · ` : ""}
                  {q.source_anchor ?? "no source"}
                  {q.origin !== "self" ? ` · ${q.origin}` : ""}
                </Text>
              </View>
              <Pressable
                onPress={() => void onRetire(q.id)}
                accessibilityRole="button"
                accessibilityLabel={`Retire question: ${q.prompt}`}
                hitSlop={8}
              >
                <Text style={textStyle("bodyS", color.inkFaint)}>Retire</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space[5], gap: space[4] },
  spacedTop: { marginTop: space[2] },
  skipLink: { marginTop: space[2], alignSelf: "flex-start" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    padding: space[3],
  },
  rowBody: { flex: 1, gap: space[1] },
});
