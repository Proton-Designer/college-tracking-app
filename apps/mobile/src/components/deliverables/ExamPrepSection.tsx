import {
  assessPracticeBenchmark,
  buildExamCurve,
  type ExamSessionKind,
  type LocalDate,
  type PracticeBenchmarkVerdict,
} from "@collegeos/core";
import {
  createQuestion,
  getDeliverableRealScorePct,
  getUserLocalToday,
  getOwnProfile,
  listPracticeTestsForDeliverable,
  logPracticeTest,
  type Deliverable,
  type PracticeTestRow,
} from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { getMobileSupabaseClient } from "../../lib/supabase/client";
import { Button, Checkbox, Input, Panel } from "../ui";
import { useToast } from "../ui/ToastProvider";

const KIND_LABEL: Record<ExamSessionKind, string> = {
  retrieval: "Retrieval — blank-page recall, then the due Bank questions",
  practice_test: "Timed practice test",
  light_review: "Light review — nothing heavier the night before",
};

/**
 * S4 / D25's exam surface: the derived retrieval curve (never stored -- a pure function
 * of today and the due date), the practice-test log, the 5.6 practice-vs-real verdict
 * once a real score exists, and the missed-item → Bank conversion that migration 42
 * reserved origin='missed' for.
 */
export function ExamPrepSection({ userId, deliverable, today }: { userId: string; deliverable: Deliverable; today: LocalDate }) {
  const toast = useToast();
  const [tests, setTests] = useState<PracticeTestRow[]>([]);
  const [realScorePct, setRealScorePct] = useState<number | null>(null);
  const [score, setScore] = useState("");
  const [timed, setTimed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The missed-item converter -- shown after a test is logged.
  const [missedPrompt, setMissedPrompt] = useState("");
  const [missedAnswer, setMissedAnswer] = useState("");
  const [missedAnchor, setMissedAnchor] = useState("");

  const curve = buildExamCurve(today, deliverable.local_due_date);

  const refresh = useCallback(async () => {
    const client = getMobileSupabaseClient();
    const testsResult = await listPracticeTestsForDeliverable(client, userId, deliverable.id);
    if (testsResult.ok) setTests(testsResult.data);
    if (deliverable.grade_item_id != null) {
      const scoreResult = await getDeliverableRealScorePct(client, userId, deliverable.grade_item_id);
      if (scoreResult.ok) setRealScorePct(scoreResult.data);
    }
  }, [userId, deliverable.id, deliverable.grade_item_id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onLogTest = useCallback(async () => {
    const parsed = Number(score);
    setBusy(true);
    setError(null);
    const client = getMobileSupabaseClient();
    const profileResult = await getOwnProfile(client);
    if (!profileResult.ok) {
      setBusy(false);
      setError(profileResult.error.message);
      return;
    }
    const result = await logPracticeTest(client, userId, {
      courseId: deliverable.course_id,
      deliverableId: deliverable.id,
      localDate: getUserLocalToday(profileResult.data.timezone, new Date()),
      scorePct: parsed,
      timed,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setScore("");
    toast.show("Logged. Add what you missed to the Bank while it stings.", "success");
    await refresh();
  }, [score, timed, userId, deliverable.course_id, deliverable.id, toast, refresh]);

  const onAddMissed = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await createQuestion(getMobileSupabaseClient(), userId, {
      courseId: deliverable.course_id,
      prompt: missedPrompt,
      answer: missedAnswer,
      origin: "missed",
      ...(missedAnchor.trim() !== "" ? { sourceAnchor: missedAnchor } : { sourceSkipped: true }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setMissedPrompt("");
    setMissedAnswer("");
    setMissedAnchor("");
    toast.show("In the Bank — it'll come back until it sticks.", "success");
  }, [userId, deliverable.course_id, missedPrompt, missedAnswer, missedAnchor, toast]);

  const verdict: PracticeBenchmarkVerdict | null =
    realScorePct != null
      ? assessPracticeBenchmark(
          tests.map((t) => ({ localDate: t.local_date, scorePct: Number(t.score_pct), timed: t.timed })),
          realScorePct,
        )
      : null;

  return (
    <View style={{ gap: space[3] }}>
      <Text style={textStyle("label", color.inkMuted)}>Exam prep</Text>

      <Panel>
        <Text style={textStyle("label", color.inkMuted)}>Retrieval curve</Text>
        {curve.examReached ? (
          <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
            The exam date has arrived — the curve is behind you.
          </Text>
        ) : (
          <>
            {curve.compressed ? (
              <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
                Late start — the earlier sessions are gone; what remains is still the curve&apos;s tail, not a cram.
              </Text>
            ) : null}
            {curve.sessions.map((session) => (
              <View key={`${session.date}-${session.kind}`} style={styles.curveRow}>
                <Text style={[textStyle("bodyS", color.ink), styles.curveDate]}>
                  {session.date} · D-{session.daysBefore}
                </Text>
                <Text style={[textStyle("bodyS", color.inkMuted), styles.curveLabel]}>{KIND_LABEL[session.kind]}</Text>
              </View>
            ))}
          </>
        )}
      </Panel>

      <Panel>
        <Text style={textStyle("label", color.inkMuted)}>Practice tests</Text>
        {tests.map((t) => (
          <View key={t.id} style={styles.testRow}>
            <Text style={textStyle("bodyS", color.ink)}>
              {t.local_date} · {Math.round(Number(t.score_pct))}%{t.timed ? " · timed" : ""}
            </Text>
          </View>
        ))}
        {verdict != null && verdict.kind === "practiceInflated" ? (
          <Text style={[textStyle("bodyS", color.riskHigh), styles.spacedTop]}>
            Practice averaged {Math.round(verdict.practiceAvgPct)}%, the real result was{" "}
            {Math.round(verdict.realScorePct)}%. {verdict.recommendation}
          </Text>
        ) : null}
        {verdict != null && verdict.kind === "aligned" ? (
          <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
            Practice ({Math.round(verdict.practiceAvgPct)}%) and the real result ({Math.round(verdict.realScorePct)}%)
            agree — the rehearsal was honest.
          </Text>
        ) : null}
        {error != null ? <Text style={[textStyle("bodyS", color.riskCritical), styles.spacedTop]}>{error}</Text> : null}
        <View style={styles.spacedTop}>
          <Input
            label="Score (%)"
            value={score}
            onChangeText={setScore}
            keyboardType="numeric"
            placeholder="85"
            editable={!busy}
          />
        </View>
        <View style={styles.spacedTop}>
          <Checkbox label="Timed, exam conditions" checked={timed} onValueChange={setTimed} />
        </View>
        <View style={styles.spacedTop}>
          <Button
            variant="secondary"
            onPress={onLogTest}
            loading={busy}
            disabled={busy || score.trim() === "" || !Number.isFinite(Number(score))}
          >
            Log practice test
          </Button>
        </View>
      </Panel>

      {tests.length > 0 ? (
        <Panel>
          <Text style={textStyle("label", color.inkMuted)}>Missed an item? Bank it</Text>
          <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
            Anything you got wrong becomes a question and comes back on the curve.
          </Text>
          <View style={styles.spacedTop}>
            <Input label="Prompt" value={missedPrompt} onChangeText={setMissedPrompt} editable={!busy} />
          </View>
          <View style={styles.spacedTop}>
            <Input label="Answer" value={missedAnswer} onChangeText={setMissedAnswer} editable={!busy} />
          </View>
          <View style={styles.spacedTop}>
            <Input
              label="Source anchor (optional)"
              value={missedAnchor}
              onChangeText={setMissedAnchor}
              placeholder="p. 142 / slide 18"
              editable={!busy}
            />
          </View>
          <View style={styles.spacedTop}>
            <Button
              variant="secondary"
              onPress={onAddMissed}
              disabled={busy || missedPrompt.trim() === "" || missedAnswer.trim() === ""}
            >
              Add to the Bank
            </Button>
          </View>
        </Panel>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  spacedTop: { marginTop: space[2] },
  curveRow: { marginTop: space[3], gap: space[1] },
  curveDate: { fontVariant: ["tabular-nums"] },
  curveLabel: {},
  testRow: { marginTop: space[2] },
});
