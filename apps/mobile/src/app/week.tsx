import { color, radius, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Panel } from "../components/ui";
import { textStyle } from "../design/typography";
import { loadWeekReview, type WeekReviewState } from "../lib/weekActions";
import { loadBank } from "../lib/bankActions";
import type { CourseCalibration } from "@collegeos/core";
import { loadHabits, type HabitState } from "../lib/habitsActions";
import { useAuthSession } from "../lib/useAuthSession";

/** Pretty labels for the cause enum -- same wording as the timer's chips. */
const CAUSE_LABELS: Record<string, string> = {
  phone: "Phone",
  got_hard: "Got hard",
  finished_early: "Finished early",
  notification: "Notification",
  reflex: "Reflex",
  bored: "Bored",
};

/**
 * The Sunday Review -- BLUEPRINT Part III "Weekly". A reading surface, not a ritual with
 * steps: hours by category against the goals, the distraction Pareto, the efficiency
 * trend, habit scores. Ten minutes, once a week, no writes.
 */
export default function WeekScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session: authSession } = useAuthSession();
  const userId = authSession?.user.id ?? null;

  const [state, setState] = useState<WeekReviewState | null>(null);
  const [habits, setHabits] = useState<HabitState[]>([]);
  const [calibration, setCalibration] = useState<CourseCalibration[]>([]);
  const [courseCodeById, setCourseCodeById] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (userId == null) return;
    const [review, habitResult, bank] = await Promise.all([
      loadWeekReview(userId),
      loadHabits(userId),
      loadBank(userId),
    ]);
    if (bank.ok) {
      setCalibration(bank.data.calibration);
      setCourseCodeById(bank.data.courseCodeById);
    }
    if (review.ok) setState(review.data);
    else setError(review.error);
    if (habitResult.ok) setHabits(habitResult.data.habits);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const review = state?.review ?? null;
  const maxCategoryMinutes = review?.hoursByCategory[0]?.minutes ?? 0;

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

        <Text style={textStyle("displayM", color.ink)}>This week</Text>
        {state != null ? (
          <Text style={textStyle("label", color.inkMuted)}>
            {state.fromDate} → {state.toDate}
          </Text>
        ) : null}

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        {loading || review == null ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>Loading…</Text>
        ) : (
          <>
            <Panel>
              <Text style={textStyle("label", color.inkMuted)}>Hours</Text>
              <Text style={[textStyle("displayM", color.ink), styles.spacedTop]}>
                {review.totalHours}
              </Text>
              <Text style={textStyle("bodyS", color.inkMuted)}>
                {Math.round(review.totalMinutes / 6) / 10}h of deep work
              </Text>
            </Panel>

            {review.hoursByCategory.length > 0 ? (
              <Panel>
                <Text style={textStyle("label", color.inkMuted)}>By category</Text>
                {review.hoursByCategory.map((c) => (
                  <View key={c.category} style={styles.barRow}>
                    <View style={styles.barLabelRow}>
                      <Text style={textStyle("bodyS", color.ink)}>{c.category}</Text>
                      <Text style={textStyle("bodyS", color.inkMuted)}>
                        {Math.round(c.minutes / 6) / 10}h
                      </Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          { width: `${Math.max(4, (c.minutes / Math.max(maxCategoryMinutes, 1)) * 100)}%` },
                        ]}
                      />
                    </View>
                  </View>
                ))}
              </Panel>
            ) : null}

            <Panel>
              <Text style={textStyle("label", color.inkMuted)}>
                Distractions — {review.totalDistractions} this week
              </Text>
              {review.distractionPareto.length === 0 ? (
                <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
                  None logged. Either a great week or an unlogged one — you know which.
                </Text>
              ) : (
                review.distractionPareto.map((c) => (
                  <View key={c.cause} style={styles.paretoRow}>
                    <Text style={[textStyle("bodyS", color.ink), styles.paretoLabel]}>
                      {CAUSE_LABELS[c.cause] ?? c.cause}
                    </Text>
                    <Text style={textStyle("bodyS", color.inkMuted)}>
                      {c.count} · {Math.round(c.share * 100)}%
                    </Text>
                  </View>
                ))
              )}
            </Panel>

            <Panel>
              <Text style={textStyle("label", color.inkMuted)}>Efficiency by day</Text>
              {review.efficiencyByDay.length === 0 ? (
                <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
                  No closed days yet — efficiency settles when the Night Plan closes a day.
                </Text>
              ) : (
                review.efficiencyByDay.map((d) => (
                  <View key={d.localDate} style={styles.paretoRow}>
                    <Text style={[textStyle("bodyS", color.ink), styles.paretoLabel]}>
                      {d.localDate}
                    </Text>
                    <Text style={textStyle("bodyS", color.inkMuted)}>
                      {d.ratio != null ? `${Math.round(d.ratio * 100)}%` : "— not closed"}
                    </Text>
                  </View>
                ))
              )}
            </Panel>

            {calibration.some((c) => c.flagged) ? (
              <Panel>
                <Text style={textStyle("label", color.inkMuted)}>Calibration</Text>
                {calibration
                  .filter((c) => c.flagged)
                  .map((c) => (
                    <Text key={c.courseId} style={[textStyle("bodyS", color.ink), styles.spacedTop]}>
                      When you answer &quot;Sure&quot; in {courseCodeById[c.courseId] ?? `course #${c.courseId}`}, you&apos;re wrong{" "}
                      {Math.round(c.sureWrongRate * 100)}% of the time ({c.sureWrongCount} of {c.sureCount}).
                      That&apos;s an illusion-of-competence signal — those topics are weighted up in the
                      queue.
                    </Text>
                  ))}
              </Panel>
            ) : null}

            {habits.length > 0 ? (
              <Panel>
                <Text style={textStyle("label", color.inkMuted)}>Habit scores</Text>
                {habits.map((h) => (
                  <View key={h.habit.id} style={styles.paretoRow}>
                    <Text style={[textStyle("bodyS", color.ink), styles.paretoLabel]}>
                      {h.habit.name}
                    </Text>
                    <Text style={textStyle("bodyS", color.inkMuted)}>
                      {h.habit.paused ? "paused" : Math.round(h.score)}
                    </Text>
                  </View>
                ))}
              </Panel>
            ) : null}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space[5], gap: space[4] },
  spacedTop: { marginTop: space[2] },
  barRow: { marginTop: space[3], gap: space[1] },
  barLabelRow: { flexDirection: "row", justifyContent: "space-between" },
  barTrack: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceSunken,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: radius.pill, backgroundColor: color.accent },
  paretoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: space[3],
  },
  paretoLabel: { flex: 1 },
});
