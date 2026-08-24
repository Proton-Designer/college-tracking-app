import { color, radius, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { AppState, StyleSheet, Text, View } from "react-native";
import { Aurora, Button, Panel, TabScreenScrollView } from "../../components/ui";
import { textStyle } from "../../design/typography";
import { loadDay, startDayAction, type DayState } from "../../lib/dayActions";
import { useAuthSession } from "../../lib/useAuthSession";

function formatClock(totalSeconds: number): string {
  const clamped = Math.max(0, totalSeconds);
  const h = Math.floor(clamped / 3600);
  const m = Math.floor((clamped % 3600) / 60);
  const s = clamped % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * The day surface -- BLUEPRINT Part III "Morning Start", Phase 1.
 *
 * Two different numbers live on this screen and they must not be conflated:
 *
 *  - The RUNNING clock, shown before any Hour has completed. It is simply now - wake_at,
 *    computed here, and it exists to be a live race the user can see.
 *  - DELTA, shown once the first Hour completes. That is packages/core's
 *    computeDeltaSeconds -- wake to the first COMPLETED Hour -- and it freezes. It is
 *    null, never 0, until both ends of the measurement exist.
 *
 * Showing the running clock as "Delta" would quietly redefine the product's headline
 * metric as "time since waking", which is not what it measures.
 */
export default function DayScreen() {
  const router = useRouter();
  const { session: authSession } = useAuthSession();
  const userId = authSession?.user.id ?? null;

  const [state, setState] = useState<DayState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    if (userId == null) return;
    const result = await loadDay(userId);
    if (result.ok) setState(result.data);
    else setError(result.error);
    setLoading(false);
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

  // Tick only while there is something live to show: a wake time exists and Delta has not
  // settled yet. Once Delta is fixed the number stops moving, so re-rendering every second
  // would be pure battery cost.
  useEffect(() => {
    if (wakeAtMs == null || deltaSettled) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [wakeAtMs, deltaSettled]);

  const onStartDay = useCallback(async () => {
    if (userId == null) return;
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

  const sinceWakeSeconds = wakeAtMs != null ? Math.floor((now - wakeAtMs) / 1000) : null;

  return (
    <View style={styles.screen}>
      <Aurora band={null} />
      <TabScreenScrollView transparent>
        <Text style={textStyle("label", color.inkMuted)}>{state?.localDate ?? ""}</Text>

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        {loading ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>Loading…</Text>
        ) : wakeAtMs == null ? (
          <Panel>
            <Text style={textStyle("displayM", color.ink)}>Start Day</Text>
            <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
              One tap logs your wake time. Delta is the race from here to your first
              completed Hour.
            </Text>
            <View style={styles.spacedTop}>
              <Button onPress={onStartDay} disabled={busy}>
                Start Day
              </Button>
            </View>
          </Panel>
        ) : (
          <>
            <View style={styles.clockBlock}>
              {deltaSettled ? (
                <>
                  <Text style={textStyle("label", color.inkMuted)}>Delta</Text>
                  <Text style={[textStyle("metricXl", color.ink), styles.clock]}>
                    {formatClock(state!.deltaSeconds!)}
                  </Text>
                  <Text style={textStyle("bodyS", color.inkMuted)}>wake → first Hour completed</Text>
                </>
              ) : (
                <>
                  <Text style={textStyle("label", color.inkMuted)}>Since wake</Text>
                  <Text style={[textStyle("metricXl", color.ink), styles.clock]}>
                    {formatClock(sinceWakeSeconds ?? 0)}
                  </Text>
                  <Text style={textStyle("bodyS", color.inkMuted)}>
                    Delta lands when your first Hour completes
                  </Text>
                </>
              )}
            </View>

            <Panel>
              <Text style={textStyle("label", color.inkMuted)}>Hours</Text>
              <Text style={[textStyle("displayM", color.ink), styles.spacedTop]}>
                {state!.completedHours} of {state!.baselineHours}
              </Text>
              {state!.dayWon ? (
                <View style={styles.wonPill}>
                  <Text style={textStyle("label", color.surface)}>Day Won</Text>
                </View>
              ) : (
                <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
                  {state!.baselineHours - state!.completedHours} to go
                </Text>
              )}
            </Panel>

            <Panel>
              <Text style={textStyle("label", color.inkMuted)}>Efficiency</Text>
              {state!.efficiency.ratio == null ? (
                <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
                  Not measurable yet.
                </Text>
              ) : (
                <>
                  <Text style={[textStyle("displayM", color.ink), styles.spacedTop]}>
                    {Math.round(state!.efficiency.ratio * 100)}%
                  </Text>
                  <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
                    {state!.efficiency.workedMinutes}m worked of {state!.efficiency.awakeMinutes}m awake
                    {state!.efficiency.settled ? "" : " · so far today"}
                  </Text>
                </>
              )}
            </Panel>

            <Button onPress={() => router.push("/hour")}>Start an Hour</Button>
            <Button variant="secondary" onPress={() => router.push("/wall")}>
              The Wall
            </Button>
            <Button variant="secondary" onPress={() => router.push("/nightplan")}>
              Night Plan
            </Button>
            <Button variant="secondary" onPress={() => router.push("/cards")}>
              Cards
            </Button>
          </>
        )}
      </TabScreenScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  spacedTop: { marginTop: space[2] },
  clockBlock: { alignItems: "center", gap: space[2], paddingVertical: space[6] },
  clock: { fontVariant: ["tabular-nums"] },
  wonPill: {
    alignSelf: "flex-start",
    marginTop: space[3],
    backgroundColor: color.accent,
    borderRadius: radius.pill,
    paddingVertical: space[2],
    paddingHorizontal: space[4],
  },
});
