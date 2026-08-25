import type { DraftedQuestion, QuestionRow } from "@collegeos/api";
import { color, radius, space } from "@collegeos/design/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Button, Input, Panel, Textarea } from "../components/ui";
import { textStyle } from "../design/typography";
import { addQuestion, draftFromNotes, loadCourseQuestions, retireQuestionAction } from "../lib/bankActions";
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
  const [notes, setNotes] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [drafts, setDrafts] = useState<(DraftedQuestion & { anchor: string; skipped: boolean })[]>([]);
  const [draftNote, setDraftNote] = useState<string | null>(null);

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

  const onDraft = useCallback(async () => {
    if (userId == null) return;
    setDrafting(true);
    setError(null);
    setDraftNote(null);
    const result = await draftFromNotes(userId, notes);
    setDrafting(false);
    if (!result.ok) {
      setError(result.error ?? "Drafting failed.");
      return;
    }
    if (result.data.kind === "tooThin") {
      setDraftNote("Not enough substance to draft from — paste a fuller section of notes.");
      return;
    }
    // Anchor prefilled from the model's sourceHint when the notes contained one; never
    // invented. The accept path still enforces anchor-or-skip per card.
    setDrafts(result.data.questions.map((q) => ({ ...q, anchor: q.sourceHint ?? "", skipped: false })));
    setNotes("");
  }, [userId, notes]);

  const onAcceptDraft = useCallback(
    async (draftIndex: number) => {
      if (userId == null) return;
      const d = drafts[draftIndex];
      if (d == null) return;
      const result = await addQuestion(userId, {
        courseId,
        prompt: d.prompt,
        answer: d.answer,
        topic: d.topic,
        origin: "ai",
        ...(d.skipped ? { sourceSkipped: true } : { sourceAnchor: d.anchor }),
      });
      if (!result.ok) {
        setError(result.error ?? "Could not accept that card.");
        return;
      }
      setDrafts((prev) => prev.filter((_, i) => i !== draftIndex));
      await refresh();
    },
    [userId, drafts, courseId, refresh],
  );

  const patchDraft = useCallback((draftIndex: number, patch: Partial<DraftedQuestion & { anchor: string; skipped: boolean }>) => {
    setDrafts((prev) => prev.map((d, i) => (i === draftIndex ? { ...d, ...patch } : d)));
  }, []);

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

        <Panel>
          <Text style={textStyle("label", color.inkMuted)}>Draft from notes</Text>
          <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
            Paste a section of notes; you edit every card before it enters the Bank.
          </Text>
          <View style={styles.spacedTop}>
            <Textarea label="Notes" value={notes} onChangeText={setNotes} editable={!drafting} />
          </View>
          {draftNote != null ? (
            <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>{draftNote}</Text>
          ) : null}
          <View style={styles.spacedTop}>
            <Button variant="secondary" onPress={onDraft} disabled={drafting || notes.trim().length < 200} loading={drafting}>
              {drafting ? "Drafting…" : "Draft questions"}
            </Button>
          </View>
        </Panel>

        {drafts.map((d, i) => (
          <Panel key={`${d.prompt}-${i}`}>
            <Text style={textStyle("label", color.inkMuted)}>Draft — edit, then accept</Text>
            <View style={styles.spacedTop}>
              <Textarea label="Prompt" value={d.prompt} onChangeText={(t) => patchDraft(i, { prompt: t })} />
            </View>
            <View style={styles.spacedTop}>
              <Textarea label="Answer" value={d.answer} onChangeText={(t) => patchDraft(i, { answer: t })} />
            </View>
            <View style={styles.spacedTop}>
              <Input label="Topic" value={d.topic} onChangeText={(t) => patchDraft(i, { topic: t })} />
            </View>
            <View style={styles.spacedTop}>
              {d.skipped ? (
                <Pressable onPress={() => patchDraft(i, { skipped: false })} accessibilityRole="button">
                  <Text style={textStyle("bodyS", color.inkMuted)}>Source skipped. Tap to add one.</Text>
                </Pressable>
              ) : (
                <>
                  <Input
                    label="Source anchor"
                    value={d.anchor}
                    onChangeText={(t) => patchDraft(i, { anchor: t })}
                    placeholder="p. 142 / slide 18"
                  />
                  <Pressable onPress={() => patchDraft(i, { skipped: true })} accessibilityRole="button" style={styles.skipLink}>
                    <Text style={textStyle("bodyS", color.inkFaint)}>No source for this one</Text>
                  </Pressable>
                </>
              )}
            </View>
            <View style={[styles.spacedTop, styles.draftActions]}>
              <View style={styles.draftAction}>
                <Button
                  onPress={() => void onAcceptDraft(i)}
                  disabled={d.prompt.trim() === "" || d.answer.trim() === "" || (!d.skipped && d.anchor.trim() === "")}
                >
                  Accept
                </Button>
              </View>
              <View style={styles.draftAction}>
                <Button variant="secondary" onPress={() => setDrafts((prev) => prev.filter((_, j) => j !== i))}>
                  Discard
                </Button>
              </View>
            </View>
          </Panel>
        ))}

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
  draftActions: { flexDirection: "row", gap: space[3] },
  draftAction: { flex: 1 },
});
