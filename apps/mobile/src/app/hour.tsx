import type { DistractionCause, DistractionRow, TaskSessionRow } from "@collegeos/api";
import { color, radius, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Button, Input, Panel } from "../components/ui";
import { textStyle } from "../design/typography";
import {
  endHourAction,
  loadActiveHour,
  loadTodayHours,
  logDistractionAction,
  startHourAction,
  type TodayHoursState,
} from "../lib/hourActions";
import {
  cancelHourEndAlert,
  ensureNotificationPermission,
  scheduleHourEndAlert,
} from "../lib/hourNotifications";
import { useAuthSession } from "../lib/useAuthSession";

const HOUR_SECONDS = 60 * 60;

/** The six causes, in the blueprint's order. Values match the distraction_cause enum. */
const CAUSES: { value: DistractionCause; label: string }[] = [
  { value: "phone", label: "Phone" },
  { value: "got_hard", label: "Got hard" },
  { value: "finished_early", label: "Finished early" },
  { value: "notification", label: "Notification" },
  { value: "reflex", label: "Reflex" },
  { value: "bored", label: "Bored" },
];

function formatElapsed(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const m = Math.floor(clamped / 60);
  const s = clamped % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * The Deep Work Hour -- BLUEPRINT Part III/IV-A, Phase 1.
 *
 * Elapsed time is ALWAYS re-derived from the session's stored `actual_start` against the
 * wall clock, never accumulated in a JS interval. The interval below only forces a
 * re-render; it is not the source of truth. That is what lets the Hour survive being
 * backgrounded, locked or killed -- the property migration 12's one-active-session index
 * was added for -- and it is why the screen re-reads on foreground rather than trusting
 * whatever it was holding when the phone went to sleep.
 */
export default function HourScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session: authSession } = useAuthSession();
  const userId = authSession?.user.id ?? null;

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<TaskSessionRow | null>(null);
  const [distractions, setDistractions] = useState<DistractionRow[]>([]);
  const [deliverable, setDeliverable] = useState("");
  const [today, setToday] = useState<TodayHoursState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [causePickerOpen, setCausePickerOpen] = useState(false);

  const refresh = useCallback(async () => {
    if (userId == null) return;
    const [activeResult, todayResult] = await Promise.all([loadActiveHour(userId), loadTodayHours(userId)]);
    if (activeResult.ok) {
      const session = activeResult.data.session;
      setActive(session);
      setDistractions(activeResult.data.distractions);
      // Re-assert the 60:00 alert every time we learn there is a live Hour. Scheduling is
      // idempotent because the identifier is derived from the session id, and an already
      // -elapsed end time is a no-op -- so this repairs an alert lost to an app kill
      // without ever double-firing one.
      if (session != null && session.actual_start != null) {
        void scheduleHourEndAlert(
          session.id,
          session.hour_index,
          session.deliverable,
          new Date(Date.parse(session.actual_start) + HOUR_SECONDS * 1000),
        );
      }
    } else {
      setError(activeResult.error);
    }
    if (todayResult.ok) setToday(todayResult.data);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        setNow(Date.now());
        void refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  useEffect(() => {
    if (active == null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  const startedAtMs = active?.actual_start != null ? Date.parse(active.actual_start) : null;
  const elapsedSeconds = startedAtMs != null ? Math.floor((now - startedAtMs) / 1000) : 0;
  const remainingSeconds = HOUR_SECONDS - elapsedSeconds;

  const onStart = useCallback(async () => {
    if (userId == null) return;
    setBusy(true);
    setError(null);
    const result = await startHourAction(userId, { deliverable, category: null });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not start the Hour.");
      return;
    }
    setDeliverable("");
    // Asked here, with the Hour visibly starting, rather than at app launch: a permission
    // prompt with no context attached is the one most likely to be denied. A denial does
    // not stop the Hour -- it only means no alert at 60:00.
    await ensureNotificationPermission();
    const started = result.session;
    if (started?.actual_start != null) {
      await scheduleHourEndAlert(
        started.id,
        started.hour_index,
        started.deliverable,
        new Date(Date.parse(started.actual_start) + HOUR_SECONDS * 1000),
      );
    }
    await refresh();
  }, [userId, deliverable, refresh]);

  const onLogCause = useCallback(
    async (cause: DistractionCause) => {
      if (userId == null || active == null) return;
      setCausePickerOpen(false);
      const result = await logDistractionAction(userId, active.id, cause);
      if (!result.ok) {
        setError(result.error ?? "Could not log that distraction.");
        return;
      }
      await refresh();
    },
    [userId, active, refresh],
  );

  const onEnd = useCallback(async () => {
    if (userId == null || active == null) return;
    setBusy(true);
    setError(null);
    const endedSessionId = active.id;
    const result = await endHourAction(userId, endedSessionId, {});
    setBusy(false);
    // Cancel regardless of outcome: if the end failed, refresh() will re-assert the alert
    // from the still-active session, so the worst case is a redundant cancel rather than
    // an orphaned alert firing for an Hour that already finished.
    await cancelHourEndAlert(endedSessionId);
    if (!result.ok) {
      setError(result.error ?? "Could not end the Hour.");
      return;
    }
    setCausePickerOpen(false);
    await refresh();
  }, [userId, active, refresh]);

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

        {today != null ? (
          <Text style={textStyle("label", color.inkMuted)}>
            {today.completedHours} of {today.baselineHours} Hours today
            {today.dayWon ? " · Day Won" : ""}
          </Text>
        ) : null}

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        {loading ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>Loading…</Text>
        ) : active == null ? (
          <Panel>
            <Text style={textStyle("displayM", color.ink)}>Start an Hour</Text>
            <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
              One specific thing. The timer will not arm without it.
            </Text>
            <View style={styles.field}>
              <Input
                label="Deliverable"
                value={deliverable}
                onChangeText={setDeliverable}
                placeholder="e.g. ECON problem set 4, questions 1-8"
                editable={!busy}
              />
            </View>
            <Button onPress={onStart} disabled={busy || deliverable.trim().length === 0}>
              Start Hour
            </Button>
          </Panel>
        ) : (
          <>
            <View style={styles.timerBlock}>
              <Text style={textStyle("label", color.inkMuted)}>Hour {active.hour_index ?? "?"}</Text>
              <Text style={[textStyle("metricXl", color.ink), styles.timer]}>
                {formatElapsed(elapsedSeconds)}
              </Text>
              <Text style={textStyle("bodyS", color.inkMuted)}>
                {remainingSeconds > 0
                  ? `${formatElapsed(remainingSeconds)} left`
                  : `${formatElapsed(-remainingSeconds)} over`}
              </Text>
              <Text style={[textStyle("bodyL", color.ink), styles.deliverable]}>{active.deliverable}</Text>
            </View>

            {causePickerOpen ? (
              <Panel>
                <Text style={textStyle("bodyS", color.inkMuted)}>What pulled you away?</Text>
                <View style={styles.causeGrid}>
                  {CAUSES.map((c) => (
                    <Pressable
                      key={c.value}
                      onPress={() => void onLogCause(c.value)}
                      accessibilityRole="button"
                      style={styles.causeChip}
                    >
                      <Text style={textStyle("bodyS", color.ink)}>{c.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </Panel>
            ) : (
              <Pressable
                onPress={() => setCausePickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Log a distraction"
                style={styles.distractionButton}
              >
                <Text style={textStyle("metricXl", color.surface)}>+1</Text>
                <Text style={textStyle("label", color.surface)}>Distraction</Text>
              </Pressable>
            )}

            <Text style={textStyle("bodyS", color.inkMuted)}>
              {distractions.length} distraction{distractions.length === 1 ? "" : "s"} this Hour
            </Text>

            <Button variant="secondary" onPress={onEnd} disabled={busy}>
              End Hour
            </Button>
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
  field: { marginVertical: space[3] },
  timerBlock: { alignItems: "center", gap: space[2], paddingVertical: space[6] },
  timer: { fontVariant: ["tabular-nums"] },
  deliverable: { textAlign: "center", marginTop: space[3] },
  distractionButton: {
    backgroundColor: color.accent,
    borderRadius: radius.lg,
    paddingVertical: space[8],
    alignItems: "center",
    gap: space[1],
  },
  causeGrid: { flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[3] },
  causeChip: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.pill,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
  },
});
