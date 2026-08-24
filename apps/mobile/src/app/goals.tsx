import { color, radius, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Button, Input, Panel } from "../components/ui";
import { textStyle } from "../design/typography";
import {
  addGoal,
  loadWarMap,
  retireGoalAction,
  setMilestoneAction,
  toggleMilestoneDone,
  type WarMapEntry,
} from "../lib/goalsActions";
import { useAuthSession } from "../lib/useAuthSession";

/**
 * War Map Lite -- BLUEPRINT IV-B. Top 5 Goals, one monthly milestone each, and the
 * nightly plan pulls from milestones. No annual grid, deliberately: the blueprint calls
 * the full version "a spreadsheet cosplaying as software" and this screen takes its side.
 */
export default function GoalsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session: authSession } = useAuthSession();
  const userId = authSession?.user.id ?? null;

  const [entries, setEntries] = useState<WarMapEntry[]>([]);
  const [month, setMonth] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [numberText, setNumberText] = useState("");
  const [reason, setReason] = useState("");
  const [milestoneDrafts, setMilestoneDrafts] = useState<Record<number, string>>({});

  const refresh = useCallback(async () => {
    if (userId == null) return;
    const result = await loadWarMap(userId);
    if (result.ok) {
      setEntries(result.data.entries);
      setMonth(result.data.month);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onAddGoal = useCallback(async () => {
    if (userId == null) return;
    setBusy(true);
    setError(null);
    const result = await addGoal(userId, { title, number: numberText, reason });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not add the goal.");
      return;
    }
    setTitle("");
    setNumberText("");
    setReason("");
    setAdding(false);
    await refresh();
  }, [userId, title, numberText, reason, refresh]);

  const onSetMilestone = useCallback(
    async (goalId: number) => {
      if (userId == null) return;
      const draft = milestoneDrafts[goalId] ?? "";
      const result = await setMilestoneAction(userId, goalId, draft);
      if (!result.ok) {
        setError(result.error ?? "Could not set the milestone.");
        return;
      }
      setMilestoneDrafts((prev) => ({ ...prev, [goalId]: "" }));
      await refresh();
    },
    [userId, milestoneDrafts, refresh],
  );

  const onToggleDone = useCallback(
    async (milestoneId: number, done: boolean) => {
      if (userId == null) return;
      const result = await toggleMilestoneDone(userId, milestoneId, done);
      if (!result.ok) setError(result.error ?? "Could not update the milestone.");
      await refresh();
    },
    [userId, refresh],
  );

  const onRetire = useCallback(
    async (goalId: number) => {
      if (userId == null) return;
      const result = await retireGoalAction(userId, goalId);
      if (!result.ok) {
        setError(result.error ?? "Could not retire the goal.");
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

        <Text style={textStyle("displayM", color.ink)}>War Map</Text>
        <Text style={textStyle("bodyS", color.inkMuted)}>
          Five goals, one milestone each for {month || "this month"}. The Night Plan pulls
          from these.
        </Text>

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        {loading ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>Loading…</Text>
        ) : (
          entries.map(({ goal, milestone }) => (
            <Panel key={goal.id}>
              <View style={styles.goalHeader}>
                <View style={styles.goalTitleBlock}>
                  <Text style={textStyle("bodyL", color.ink)}>
                    {goal.position}. {goal.title}
                  </Text>
                  {goal.number != null || goal.deadline != null ? (
                    <Text style={textStyle("bodyS", color.inkMuted)}>
                      {[goal.number, goal.deadline].filter(Boolean).join(" · ")}
                    </Text>
                  ) : null}
                  {goal.reason != null ? (
                    <Text style={textStyle("bodyS", color.inkFaint)}>{goal.reason}</Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => void onRetire(goal.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Retire goal: ${goal.title}`}
                  hitSlop={8}
                >
                  <Text style={textStyle("bodyS", color.inkFaint)}>Retire</Text>
                </Pressable>
              </View>

              {milestone != null ? (
                <Pressable
                  onPress={() => void onToggleDone(milestone.id, !milestone.done)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: milestone.done }}
                  style={styles.milestoneRow}
                >
                  <Text style={textStyle("body", milestone.done ? color.inkMuted : color.ink)}>
                    {milestone.done ? "✓ " : "○ "}
                    {milestone.title}
                  </Text>
                </Pressable>
              ) : (
                <View style={styles.spacedTop}>
                  <Input
                    label={`Milestone for ${month}`}
                    value={milestoneDrafts[goal.id] ?? ""}
                    onChangeText={(t) => setMilestoneDrafts((prev) => ({ ...prev, [goal.id]: t }))}
                    placeholder="The one thing this month"
                  />
                  <View style={styles.spacedTop}>
                    <Button
                      variant="secondary"
                      onPress={() => void onSetMilestone(goal.id)}
                      disabled={(milestoneDrafts[goal.id] ?? "").trim().length === 0}
                    >
                      Set milestone
                    </Button>
                  </View>
                </View>
              )}
            </Panel>
          ))
        )}

        {adding ? (
          <Panel>
            <Text style={textStyle("label", color.inkMuted)}>New goal</Text>
            <View style={styles.spacedTop}>
              <Input label="Title" value={title} onChangeText={setTitle} editable={!busy} />
            </View>
            <View style={styles.spacedTop}>
              <Input
                label="Number (optional)"
                value={numberText}
                onChangeText={setNumberText}
                placeholder="3.8 GPA"
                editable={!busy}
              />
            </View>
            <View style={styles.spacedTop}>
              <Input
                label="Reason (optional)"
                value={reason}
                onChangeText={setReason}
                placeholder="Why this matters"
                editable={!busy}
              />
            </View>
            <View style={styles.spacedTop}>
              <Button onPress={onAddGoal} disabled={busy || title.trim().length === 0}>
                Add goal
              </Button>
            </View>
          </Panel>
        ) : entries.length < 5 ? (
          <Button variant="secondary" onPress={() => setAdding(true)}>
            Add a goal
          </Button>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space[5], gap: space[4] },
  spacedTop: { marginTop: space[2] },
  goalHeader: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  goalTitleBlock: { flex: 1, gap: space[1] },
  milestoneRow: {
    marginTop: space[3],
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: radius.md,
    padding: space[3],
  },
});
