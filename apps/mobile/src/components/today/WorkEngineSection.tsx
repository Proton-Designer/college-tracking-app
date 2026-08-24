import { color, radius, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, Pressable, StyleSheet, Text, View } from "react-native";
import { Button, Panel } from "../ui";
import { textStyle } from "../../design/typography";
import { loadDay, startDayAction, type DayState } from "../../lib/dayActions";
import {
  loadMorningRoutine,
  MORNING_ROUTINE_ITEMS,
  toggleMorningItem,
} from "../../lib/routineActions";
import { isScheduledOn } from "@collegeos/core";

function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

const QUICK_LINKS = [
  ["Wall", "/wall"],
  ["Night Plan", "/nightplan"],
  ["Cards", "/cards"],
  ["Habits", "/habits"],
  ["Worries", "/worries"],
  ["Goals", "/goals"],
  ["Baselines", "/baselines"],
] as const;

/**
 * The Work Engine as the base of the merged day surface -- D24.
 *
 * The former /day screen recomposed as a section: it renders directly under TodayHeader in
 * EVERY mode (recovery, check-in, normal), because the Hour engine does not stop existing
 * while a check-in is open or a day is scaled down. Everything academic on the surface
 * feeds this spine; nothing here knows about courses.
 *
 * The two-clock rule from the standalone screen survives intact: "Since wake" is a live
 * race (now - wake_at, ticking), Delta is wake -> first COMPLETED Hour and freezes.
 * Conflating them would redefine the product's headline metric as "time since waking".
 */
export function WorkEngineSection({ userId }: { userId: string }) {
  const router = useRouter();
  const [state, setState] = useState<DayState | null>(null);
  const [routine, setRoutine] = useState<Map<string, boolean>>(new Map());
  const [routineOpen, setRoutineOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const [result, routineResult] = await Promise.all([loadDay(userId), loadMorningRoutine(userId)]);
    if (result.ok) setState(result.data);
    else setError(result.error);
    if (routineResult.ok) setRoutine(routineResult.data);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        setNow(Date.now());
        void refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const wakeAtMs = state?.day?.wake_at != null ? Date.parse(state.day.wake_at) : null;
  const deltaSettled = state?.deltaSeconds != null;

  // Tick only while there is a live race to show; a settled Delta does not move.
  useEffect(() => {
    if (wakeAtMs == null || deltaSettled) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [wakeAtMs, deltaSettled]);

  const onStartDay = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await startDayAction(userId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not start the day.");
      return;
    }
    setNow(Date.now());
    await refresh();
  }, [userId, refresh]);

  const onToggleRoutine = useCallback(
    async (key: string) => {
      const next = !(routine.get(key) ?? false);
      setRoutine((prev) => new Map(prev).set(key, next));
      const result = await toggleMorningItem(userId, key, next);
      if (!result.ok) {
        setRoutine((prev) => new Map(prev).set(key, !next));
        setError(result.error ?? "Could not save that.");
      }
    },
    [userId, routine],
  );

  const isMonday = state != null && isScheduledOn({ weekdays: [1] }, state.localDate);
  const sinceWakeSeconds = wakeAtMs != null ? Math.floor((now - wakeAtMs) / 1000) : null;
  const routineDone = MORNING_ROUTINE_ITEMS.filter((i) => routine.get(i.key) === true).length;

  return (
    <Panel>
      {error != null ? <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text> : null}

      {wakeAtMs == null ? (
        <>
          <Text style={textStyle("label", color.inkMuted)}>The day hasn&apos;t started</Text>
          <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
            One tap logs your wake time and starts the Delta race.
          </Text>
          <View style={styles.spacedTop}>
            <Button onPress={onStartDay} disabled={busy}>
              Start Day
            </Button>
          </View>
        </>
      ) : state != null ? (
        <>
          <View style={styles.metricsRow}>
            <View style={styles.metric}>
              <Text style={textStyle("label", color.inkMuted)}>
                {deltaSettled ? "Delta" : "Since wake"}
              </Text>
              <Text style={[textStyle("metric", color.ink), styles.clock]}>
                {deltaSettled ? formatClock(state.deltaSeconds!) : formatClock(sinceWakeSeconds ?? 0)}
              </Text>
            </View>
            <View style={styles.metric}>
              <Text style={textStyle("label", color.inkMuted)}>Hours</Text>
              <Text style={textStyle("metric", color.ink)}>
                {state.completedHours}/{state.baselineHours}
              </Text>
            </View>
            {state.efficiency.ratio != null ? (
              <View style={styles.metric}>
                <Text style={textStyle("label", color.inkMuted)}>Eff.</Text>
                <Text style={textStyle("metric", color.ink)}>
                  {Math.round(state.efficiency.ratio * 100)}%
                </Text>
              </View>
            ) : null}
          </View>

          {state.dayWon ? (
            <View style={styles.wonPill}>
              <Text style={textStyle("label", color.surface)}>Day Won</Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => setRoutineOpen(!routineOpen)}
            accessibilityRole="button"
            style={styles.spacedTop}
          >
            <Text style={textStyle("bodyS", color.inkMuted)}>
              Morning routine {routineDone}/{MORNING_ROUTINE_ITEMS.length}
              {routineOpen ? " ▾" : " ▸"}
            </Text>
          </Pressable>
          {routineOpen
            ? MORNING_ROUTINE_ITEMS.map((item) => {
                const done = routine.get(item.key) ?? false;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => void onToggleRoutine(item.key)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: done }}
                    style={styles.routineRow}
                  >
                    <Text style={textStyle("body", done ? color.inkMuted : color.ink)}>
                      {done ? "✓ " : "○ "}
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })
            : null}

          {isMonday ? (
            <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
              Monday: Hour 1 is the Anti-Worry Hour.
            </Text>
          ) : null}

          <View style={styles.spacedTop}>
            <Button onPress={() => router.push("/hour")}>Start an Hour</Button>
          </View>
        </>
      ) : null}

      <View style={styles.linkRow}>
        {QUICK_LINKS.map(([label, path]) => (
          <Pressable key={path} onPress={() => router.push(path)} accessibilityRole="link" hitSlop={6}>
            <Text style={textStyle("bodyS", color.accent)}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  spacedTop: { marginTop: space[3] },
  metricsRow: { flexDirection: "row", gap: space[5] },
  metric: { gap: space[1] },
  clock: { fontVariant: ["tabular-nums"] },
  wonPill: {
    alignSelf: "flex-start",
    marginTop: space[3],
    backgroundColor: color.accent,
    borderRadius: radius.pill,
    paddingVertical: space[1],
    paddingHorizontal: space[3],
  },
  routineRow: { paddingVertical: space[1], marginTop: space[1] },
  linkRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[4],
    marginTop: space[4],
  },
});
