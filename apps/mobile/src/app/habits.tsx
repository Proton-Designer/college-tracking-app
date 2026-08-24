import { color, radius, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Button, Input, Panel } from "../components/ui";
import { textStyle } from "../design/typography";
import {
  addHabitAction,
  loadHabits,
  setHabitPaused,
  voteAction,
  type HabitState,
} from "../lib/habitsActions";
import { useAuthSession } from "../lib/useAuthSession";

/**
 * A score is only rendered once this many scheduled days have been observed. Below it the
 * number is noise dressed as judgment -- two days of data cannot say anything about a
 * habit, and the core layer hands back observedDays precisely so the UI can decline.
 */
const MIN_DAYS_TO_JUDGE = 7;

/**
 * Habits -- BLUEPRINT Part IV-D. Identity votes, decaying scores, capped at seven.
 *
 * Every check-in renders as "a vote for [identity]" because identity framing beats outcome
 * framing (1B) and the sentence IS the mechanic, not decoration. There is deliberately no
 * red state anywhere on this screen: a dented score shows smaller, never angrier.
 */
export default function HabitsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session: authSession } = useAuthSession();
  const userId = authSession?.user.id ?? null;

  const [states, setStates] = useState<HabitState[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [identity, setIdentity] = useState("");

  const refresh = useCallback(async () => {
    if (userId == null) return;
    const result = await loadHabits(userId);
    if (result.ok) setStates(result.data.habits);
    else setError(result.error);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onVote = useCallback(
    async (state: HabitState) => {
      if (userId == null) return;
      // Tap casts the vote; tapping an already-cast vote retracts it to an explicit "not
      // today" rather than deleting the row -- silence and "no" are different answers.
      const next = state.todayVote === true ? false : true;
      const result = await voteAction(userId, state.habit.id, next);
      if (!result.ok) {
        setError(result.error ?? "Could not record the vote.");
        return;
      }
      await refresh();
    },
    [userId, refresh],
  );

  const onAdd = useCallback(async () => {
    if (userId == null) return;
    setBusy(true);
    setError(null);
    const result = await addHabitAction(userId, { name, identity });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not add the habit.");
      return;
    }
    setName("");
    setIdentity("");
    setAdding(false);
    await refresh();
  }, [userId, name, identity, refresh]);

  const onTogglePause = useCallback(
    async (state: HabitState) => {
      if (userId == null) return;
      const result = await setHabitPaused(userId, state.habit.id, !state.habit.paused);
      if (!result.ok) {
        setError(result.error ?? "Could not update the habit.");
        return;
      }
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

        <Text style={textStyle("displayM", color.ink)}>Habits</Text>
        <Text style={textStyle("bodyS", color.inkMuted)}>
          Each check-in is a vote for who you&apos;re becoming. Seven max, on purpose.
        </Text>

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        {loading ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>Loading…</Text>
        ) : (
          states.map((state) => {
            const voted = state.todayVote === true;
            return (
              <Panel key={state.habit.id}>
                <View style={styles.habitHeader}>
                  <View style={styles.habitTitleBlock}>
                    <Text style={textStyle("bodyL", color.ink)}>{state.habit.name}</Text>
                    <Text style={textStyle("bodyS", color.inkMuted)}>
                      {state.votes} vote{state.votes === 1 ? "" : "s"} for {state.habit.identity}
                    </Text>
                  </View>
                  {state.habit.paused ? (
                    <Text style={textStyle("label", color.inkMuted)}>Paused</Text>
                  ) : state.observedDays >= MIN_DAYS_TO_JUDGE ? (
                    <Text style={textStyle("label", color.inkMuted)}>{Math.round(state.score)}</Text>
                  ) : (
                    <Text style={textStyle("label", color.inkMuted)}>New</Text>
                  )}
                </View>

                {!state.habit.paused && state.observedDays >= MIN_DAYS_TO_JUDGE ? (
                  <View style={styles.scoreTrack}>
                    <View style={[styles.scoreFill, { width: `${Math.max(2, Math.min(100, state.score))}%` }]} />
                  </View>
                ) : null}

                {state.habit.why_card != null ? (
                  <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
                    {state.habit.why_card}
                  </Text>
                ) : null}

                <View style={styles.spacedTop}>
                  {state.habit.paused ? (
                    <Button variant="secondary" onPress={() => void onTogglePause(state)}>
                      Resume
                    </Button>
                  ) : (
                    <Button
                      variant={voted ? "secondary" : "primary"}
                      onPress={() => void onVote(state)}
                    >
                      {voted ? `Voted · ${state.habit.identity} ✓` : `Vote for ${state.habit.identity}`}
                    </Button>
                  )}
                </View>
                {!state.habit.paused ? (
                  <Pressable
                    onPress={() => void onTogglePause(state)}
                    accessibilityRole="button"
                    style={styles.pauseLink}
                  >
                    <Text style={textStyle("bodyS", color.inkMuted)}>
                      Pause (travel, sick — score freezes)
                    </Text>
                  </Pressable>
                ) : null}
              </Panel>
            );
          })
        )}

        {adding ? (
          <Panel>
            <Text style={textStyle("label", color.inkMuted)}>New habit</Text>
            <View style={styles.spacedTop}>
              <Input label="Name" value={name} onChangeText={setName} placeholder="Train" editable={!busy} />
            </View>
            <View style={styles.spacedTop}>
              <Input
                label="Identity"
                value={identity}
                onChangeText={setIdentity}
                placeholder="the athlete"
                editable={!busy}
              />
            </View>
            <View style={styles.spacedTop}>
              <Button onPress={onAdd} disabled={busy || name.trim().length === 0 || identity.trim().length === 0}>
                Add habit
              </Button>
            </View>
          </Panel>
        ) : (
          <Button variant="secondary" onPress={() => setAdding(true)}>
            Add a habit
          </Button>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space[5], gap: space[4] },
  spacedTop: { marginTop: space[2] },
  habitHeader: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  habitTitleBlock: { flex: 1, gap: space[1] },
  scoreTrack: {
    marginTop: space[3],
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: color.surfaceSunken,
    overflow: "hidden",
  },
  scoreFill: { height: "100%", borderRadius: radius.pill, backgroundColor: color.accent },
  pauseLink: { marginTop: space[2], alignSelf: "flex-start" },
});
