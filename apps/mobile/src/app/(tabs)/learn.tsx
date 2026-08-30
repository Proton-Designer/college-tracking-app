import type { DailySessionView, LearnCard } from "@collegeos/api";
import type { LessonRating } from "@collegeos/core";
import { color, domainColor, radius, space } from "@collegeos/design/native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Button, EmptyState, Panel, TabScreenScrollView, Textarea } from "../../components/ui";
import { textStyle } from "../../design/typography";
import { beginSession, finishSession, loadLearn, submitReview } from "../../lib/learnActions";
import { useAuthSession } from "../../lib/useAuthSession";

/**
 * Learn, mobile. Mirrors apps/web/src/components/learn/LearnClient.tsx rule for rule; both call
 * the same data layer, so the two platforms cannot disagree about what is due or what a rating
 * does — only about how a card looks.
 *
 * The three structural rules from the research are the same here:
 *
 * 1. **Free recall before reveal.** The answer is not rendered until the user commits to an
 *    attempt. Recognition-only flipping is not offered, because the generation effect depends on
 *    the attempt existing.
 * 2. **Grading only after the reveal** — "how hard was that" is not answerable before trying.
 * 3. **The queue's order is not the user's to shuffle.** Interleaving across sources is what makes
 *    retrieval discriminative rather than pattern-matched.
 *
 * The comeback moment (D29 as amended) fires from the server's own count of what is still due,
 * never from anything this screen believes.
 */

type Phase = "idle" | "recall" | "revealed" | "done";

const RATINGS: { rating: LessonRating; label: string }[] = [
  { rating: "again", label: "Again" },
  { rating: "hard", label: "Hard" },
  { rating: "good", label: "Good" },
  { rating: "easy", label: "Easy" },
];

export default function LearnScreen() {
  const { session } = useAuthSession();
  const userId = session?.user.id ?? null;

  const [view, setView] = useState<DailySessionView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [dueBefore, setDueBefore] = useState(0);
  const [reviewed, setReviewed] = useState(0);
  const [comeback, setComeback] = useState<{ daysAway: number | null; waiting: number } | null>(null);
  const shownAt = useRef(0);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const result = await loadLearn(userId);
    if (result.ok) {
      setView(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const queue = useMemo(() => {
    if (!view) return [];
    const ids = [
      ...(view.plan.warmUp ? [view.plan.warmUp.cardId] : []),
      ...view.plan.due.map((c) => c.cardId),
      ...view.plan.introductions.map((c) => c.cardId),
    ];
    return ids.map((id) => view.cards.get(id)).filter((c): c is LearnCard => c != null);
  }, [view]);

  const card = queue[index] ?? null;

  async function begin() {
    if (!userId) return;
    setBusy(true);
    const result = await beginSession(userId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSessionId(result.data.sessionId);
    setDueBefore(result.data.dueBefore);
    setPhase("recall");
    shownAt.current = Date.now();
  }

  async function grade(rating: LessonRating) {
    if (!userId || !card || !view) return;
    setBusy(true);
    const elapsedMs = shownAt.current > 0 ? Date.now() - shownAt.current : undefined;

    const result = await submitReview(userId, {
      cardId: card.card.id,
      rating,
      ...(sessionId != null ? { sessionId } : {}),
      ...(elapsedMs != null ? { elapsedMs } : {}),
      ...(answer.trim().length > 0 ? { answeredText: answer } : {}),
    });
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }

    const nextReviewed = reviewed + 1;
    setReviewed(nextReviewed);
    setAnswer("");

    if (index + 1 < queue.length) {
      setIndex(index + 1);
      setPhase("recall");
      shownAt.current = Date.now();
      setBusy(false);
      return;
    }

    if (sessionId != null) {
      const done = await finishSession(userId, {
        sessionId,
        cardsReviewed: nextReviewed,
        newLessonsIntroduced: view.plan.introductions.length,
        dueBeforeSession: dueBefore,
      });
      if (done.ok && done.data.justRecovered) {
        setComeback({ daysAway: done.data.daysAway, waiting: done.data.waiting });
      }
    }
    setPhase("done");
    setBusy(false);
    void refresh();
  }

  const content = () => {
    if (loading && view === null) {
      return <Text style={textStyle("body", color.inkMuted)}>Loading…</Text>;
    }
    if (error !== null && view === null) {
      return (
        <Panel>
          <Text style={textStyle("label", color.riskCritical)}>COULDN&apos;T LOAD LEARN</Text>
          <Text style={[textStyle("body", color.inkMuted), styles.gapTop]}>{error}</Text>
          <View style={styles.gapTop}>
            <Button onPress={() => void refresh()}>Try again</Button>
          </View>
        </Panel>
      );
    }
    if (!view) return null;

    if (queue.length === 0) {
      // Each empty state says WHY it is empty -- a different sentence every time.
      if (view.totalSources === 0) {
        return (
          <Panel>
            <EmptyState
              title="Nothing to learn from yet"
              description="Add a source on the web app and Ihsan turns it into lessons you can still recall weeks later. Nothing is scheduled until there is something to schedule."
            />
          </Panel>
        );
      }
      if (view.sourcesProcessing > 0) {
        return (
          <Panel>
            <EmptyState
              title="Still reading"
              description="Extraction runs on the server and takes a few minutes for a full book. The deck appears when every lesson has a passage behind it — one that cannot cite the text it came from is dropped rather than shown."
            />
          </Panel>
        );
      }
      return (
        <Panel>
          <EmptyState
            title="Nothing due today"
            description="That is the scheduler working, not a gap. Cards come back when you are about to forget them, which is later than it feels."
          />
        </Panel>
      );
    }

    if (phase === "idle") {
      return (
        <Panel>
          <Text style={textStyle("label", color.inkMuted)}>TODAY&apos;S SESSION</Text>
          <Text style={[textStyle("metricXl", color.ink), styles.gapTop]}>{queue.length}</Text>
          <Text style={textStyle("bodyS", color.inkMuted)}>
            {view.plan.due.length + (view.plan.warmUp ? 1 : 0)} due
            {view.plan.introductions.length > 0 ? ` · ${view.plan.introductions.length} new` : ""}
          </Text>
          {view.comeback.daysAway != null && view.comeback.daysAway >= 2 ? (
            <Text style={[textStyle("body", color.ink), styles.gapTop]}>
              {view.comeback.daysAway} days away. {view.comeback.waiting} cards were waiting — clear them
              and you&apos;re current.
            </Text>
          ) : null}
          <View style={styles.gapTop}>
            <Button onPress={() => void begin()} loading={busy}>
              Start
            </Button>
          </View>
        </Panel>
      );
    }

    if (phase === "done") {
      return (
        <Panel>
          {comeback ? (
            <>
              <Text style={textStyle("label", domainColor.business)}>BACK</Text>
              <Text style={[textStyle("bodyL", color.ink), styles.gapTop]}>
                {comeback.daysAway} days away. {comeback.waiting} cards were waiting; you cleared them.
                You&apos;re current.
              </Text>
            </>
          ) : (
            <>
              <Text style={textStyle("label", color.inkMuted)}>DONE</Text>
              <Text style={[textStyle("bodyL", color.ink), styles.gapTop]}>
                {reviewed} {reviewed === 1 ? "card" : "cards"} reviewed.
              </Text>
            </>
          )}
        </Panel>
      );
    }

    if (!card) return null;

    return (
      <View style={styles.stack}>
        <View style={styles.row}>
          <Text style={textStyle("label", color.inkMuted)}>
            {index + 1} OF {queue.length}
            {card.session.schedule.state === "new" ? " · NEW" : ""}
          </Text>
          <Text style={textStyle("caption", color.inkFaint)} numberOfLines={1}>
            {card.lesson.title}
          </Text>
        </View>

        <Panel>
          <Text style={textStyle("bodyL", color.ink)}>{card.card.prompt}</Text>

          {phase === "recall" ? (
            <View style={styles.gapTop}>
              <Textarea
                label="Answer from memory"
                value={answer}
                onChangeText={setAnswer}
                numberOfLines={4}
                placeholder="Write what you remember. Getting it wrong here is the point — the attempt is what makes it stick."
              />
              <View style={styles.gapTop}>
                <Button onPress={() => setPhase("revealed")}>Show the answer</Button>
              </View>
            </View>
          ) : (
            <View style={styles.gapTop}>
              {answer.trim().length > 0 ? (
                <View style={styles.recalled}>
                  <Text style={textStyle("label", color.inkFaint)}>YOU WROTE</Text>
                  <Text style={[textStyle("body", color.inkMuted), styles.gapTopSm]}>{answer}</Text>
                </View>
              ) : null}

              <Text style={[textStyle("label", color.inkFaint), styles.gapTop]}>THE LESSON</Text>
              <Text style={[textStyle("body", color.ink), styles.gapTopSm]}>{card.card.answer}</Text>

              {/* The grounding passage, verbatim from the source -- stored as the source's own
                  substring rather than the model's rendition, so it provably came out of the file. */}
              <View style={styles.quote}>
                <Text style={textStyle("caption", color.inkFaint)}>
                  FROM THE SOURCE{card.lesson.page_ref != null ? ` · P. ${card.lesson.page_ref}` : ""}
                </Text>
                <Text style={[textStyle("bodyS", color.inkMuted), styles.gapTopSm]}>
                  {card.lesson.provenance_quote}
                </Text>
              </View>

              {card.lesson.claim_to_task ? (
                <View style={styles.tryIt}>
                  <Text style={textStyle("label", domainColor.business)}>TRY IT</Text>
                  <Text style={[textStyle("body", color.ink), styles.gapTopSm]}>
                    {card.lesson.claim_to_task}
                  </Text>
                </View>
              ) : null}

              <Text style={[textStyle("label", color.inkFaint), styles.gapTop]}>HOW HARD WAS THAT?</Text>
              <View style={styles.ratings}>
                {RATINGS.map((option) => (
                  <Pressable
                    key={option.rating}
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void grade(option.rating)}
                    style={({ pressed }) => [
                      styles.ratingButton,
                      pressed && styles.ratingPressed,
                      busy && styles.ratingDisabled,
                    ]}
                  >
                    <Text style={textStyle("body", color.ink)}>{option.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </Panel>
      </View>
    );
  };

  return (
    <TabScreenScrollView>
      <Text style={[textStyle("displayM", color.ink), styles.gapTop]}>Learn</Text>
      <View style={styles.gapTop}>{content()}</View>
    </TabScreenScrollView>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space[4] },
  row: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space[4] },
  gapTop: { marginTop: space[4] },
  gapTopSm: { marginTop: space[3] },
  recalled: {
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: radius.sm,
    backgroundColor: color.surfaceSunken,
    padding: space[5],
  },
  quote: {
    marginTop: space[5],
    borderLeftWidth: 2,
    borderLeftColor: color.hairline,
    paddingLeft: space[5],
  },
  tryIt: {
    marginTop: space[5],
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: radius.sm,
    padding: space[5],
  },
  ratings: { flexDirection: "row", flexWrap: "wrap", gap: space[3], marginTop: space[3] },
  ratingButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: space[6],
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border,
  },
  ratingPressed: { backgroundColor: color.surfaceSunken },
  ratingDisabled: { opacity: 0.4 },
});
