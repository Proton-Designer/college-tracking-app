import { color, radius, space } from "@collegeos/design/native";
import { addDays } from "@collegeos/core";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Button, Input, Panel } from "../components/ui";
import { textStyle } from "../design/typography";
import { loadDay, setSleepIntentAction, type DayState } from "../lib/dayActions";
import { saveNightPlanAction, NIGHT_PLAN_CATEGORY_LABEL } from "../lib/nightPlanActions";
import {
  cancelNightPlanReminder,
  ensureNightPlanReminder,
  getNightPlanReminderState,
  NIGHT_PLAN_REMINDER_LABEL,
  type NightPlanReminderState,
} from "../lib/nightPlanNotifications";
import { useAuthSession } from "../lib/useAuthSession";

interface DumpItem {
  id: number;
  title: string;
  rank: 1 | 2 | 3 | null;
}

const MAX_STARRED = 3;

/**
 * The Night Plan -- BLUEPRINT Part III, the anchor ritual.
 *
 * Four steps, in the blueprint's order: dump tomorrow's list, star the three
 * highest-leverage items, crown one as the MIT, close the day. Ruling C3 makes this the
 * authoritative writer of tasks.mit_rank; the morning check-in becomes confirm-and-start.
 *
 * Starring and crowning are one control rather than two screens: tapping an unstarred item
 * stars it, tapping a starred item crowns it, tapping the crown clears it. The blueprint
 * budgets two to three minutes for the whole ritual, and a separate pass for each verb
 * spends that budget on navigation instead of thinking.
 */
export default function NightPlanScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session: authSession } = useAuthSession();
  const userId = authSession?.user.id ?? null;

  const [items, setItems] = useState<DumpItem[]>([]);
  const [draft, setDraft] = useState("");
  const [nextId, setNextId] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [today, setToday] = useState<DayState | null>(null);
  const [reminder, setReminder] = useState<NightPlanReminderState | null>(null);

  useEffect(() => {
    if (userId == null) return;
    void loadDay(userId).then((r) => {
      if (r.ok) setToday(r.data);
    });
  }, [userId]);

  useEffect(() => {
    void getNightPlanReminderState().then(setReminder);
  }, []);

  // The one place that may prompt for notification permission, because this is the one
  // screen where the reason is visible. Part VII calls the nightly anchor the highest
  // -leverage retention choice in the design, so it gets an explicit control rather than
  // being silently on or silently off.
  const onToggleReminder = useCallback(async () => {
    if (reminder?.scheduled === true) {
      await cancelNightPlanReminder();
    } else {
      await ensureNightPlanReminder(true);
    }
    setReminder(await getNightPlanReminderState());
  }, [reminder]);

  const tomorrow = today != null ? addDays(today.localDate, 1) : null;
  const starredCount = items.filter((i) => i.rank != null).length;
  const crowned = items.find((i) => i.rank === 1) ?? null;

  const addItem = useCallback(() => {
    const title = draft.trim();
    if (title.length === 0) return;
    setItems((prev) => [...prev, { id: nextId, title, rank: null }]);
    setNextId((n) => n + 1);
    setDraft("");
  }, [draft, nextId]);

  /**
   * One tap cycles: unstarred -> starred -> crowned -> unstarred.
   *
   * Crowning moves the previous crown down to the first free rank rather than silently
   * un-starring it -- the user picked three things on purpose, and changing which one is
   * the MIT should not quietly discard one of the other two.
   */
  const cycle = useCallback((id: number) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target == null) return prev;

      if (target.rank == null) {
        if (prev.filter((i) => i.rank != null).length >= MAX_STARRED) return prev;
        const taken = new Set(prev.map((i) => i.rank).filter((r) => r != null));
        const free = ([2, 3, 1] as const).find((r) => !taken.has(r)) ?? null;
        return prev.map((i) => (i.id === id ? { ...i, rank: free } : i));
      }

      if (target.rank !== 1) {
        const previousCrown = prev.find((i) => i.rank === 1);
        return prev.map((i) => {
          if (i.id === id) return { ...i, rank: 1 as const };
          if (previousCrown != null && i.id === previousCrown.id) return { ...i, rank: target.rank };
          return i;
        });
      }

      return prev.map((i) => (i.id === id ? { ...i, rank: null } : i));
    });
  }, []);

  const onSave = useCallback(async () => {
    if (userId == null || tomorrow == null) return;
    setBusy(true);
    setError(null);
    const result = await saveNightPlanAction(
      userId,
      tomorrow,
      items.map((i) => ({ title: i.title, rank: i.rank })),
    );
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not save the plan.");
      return;
    }
    setSaved(true);
  }, [userId, tomorrow, items]);

  const onCloseDay = useCallback(async () => {
    if (userId == null) return;
    setBusy(true);
    setError(null);
    const result = await setSleepIntentAction(userId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not close the day.");
      return;
    }
    router.back();
  }, [userId, router]);

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

        <Text style={textStyle("displayM", color.ink)}>Tomorrow</Text>
        {tomorrow != null ? (
          <Text style={textStyle("label", color.inkMuted)}>{tomorrow}</Text>
        ) : null}

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        {!saved ? (
          <>
            <Panel>
              <Text style={textStyle("label", color.inkMuted)}>Dump</Text>
              <View style={styles.spacedTop}>
                <Input
                  label="Add an item"
                  value={draft}
                  onChangeText={setDraft}
                  placeholder="Anything on your mind for tomorrow"
                  editable={!busy}
                  onSubmitEditing={addItem}
                  returnKeyType="done"
                />
              </View>
              <View style={styles.spacedTop}>
                <Button variant="secondary" onPress={addItem} disabled={draft.trim().length === 0}>
                  Add
                </Button>
              </View>
            </Panel>

            {items.length > 0 ? (
              <Panel>
                <Text style={textStyle("label", color.inkMuted)}>
                  Star 3, crown 1 — {starredCount} of {MAX_STARRED} starred
                </Text>
                <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
                  Tap to star. Tap a starred item again to crown it as the MIT.
                </Text>
                <View style={styles.list}>
                  {items.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => cycle(item.id)}
                      accessibilityRole="button"
                      style={[styles.row, item.rank != null ? styles.rowStarred : null]}
                    >
                      <Text style={styles.marker}>
                        {item.rank === 1 ? "♛" : item.rank != null ? "★" : "○"}
                      </Text>
                      <Text style={[textStyle("body", color.ink), styles.rowTitle]}>{item.title}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
                  Filed as {NIGHT_PLAN_CATEGORY_LABEL}. Change the category on Today.
                </Text>
              </Panel>
            ) : null}

            <Button onPress={onSave} disabled={busy || items.length === 0 || tomorrow == null}>
              Save tomorrow&apos;s plan
            </Button>

            {reminder != null ? (
              <Panel>
                <Text style={textStyle("label", color.inkMuted)}>Nightly reminder</Text>
                <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
                  {reminder.scheduled
                    ? `On, every day at ${NIGHT_PLAN_REMINDER_LABEL}.`
                    : reminder.permitted
                      ? `Off. A reminder at ${NIGHT_PLAN_REMINDER_LABEL} is what makes this a habit.`
                      : `Notifications are off for CollegeOS, so the ${NIGHT_PLAN_REMINDER_LABEL} reminder can't run.`}
                </Text>
                <View style={styles.spacedTop}>
                  <Button variant="secondary" onPress={onToggleReminder}>
                    {reminder.scheduled ? "Turn reminder off" : "Remind me nightly"}
                  </Button>
                </View>
              </Panel>
            ) : null}
          </>
        ) : (
          <Panel>
            <Text style={textStyle("displayM", color.ink)}>Tomorrow is planned</Text>
            {crowned != null ? (
              <>
                <Text style={[textStyle("label", color.inkMuted), styles.spacedTop]}>MIT</Text>
                <Text style={[textStyle("bodyL", color.ink), styles.spacedTop]}>{crowned.title}</Text>
              </>
            ) : (
              <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
                Nothing crowned — tomorrow starts with whatever you pick.
              </Text>
            )}

            {today != null ? (
              <View style={styles.statsBlock}>
                <Text style={textStyle("label", color.inkMuted)}>Today</Text>
                <Text style={[textStyle("body", color.ink), styles.spacedTop]}>
                  {today.completedHours} of {today.baselineHours} Hours
                  {today.dayWon ? " · Day Won" : ""}
                </Text>
              </View>
            ) : null}

            <View style={styles.spacedTop}>
              <Button onPress={onCloseDay} disabled={busy}>
                Close the day
              </Button>
            </View>
          </Panel>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space[5], gap: space[4] },
  spacedTop: { marginTop: space[2] },
  list: { marginTop: space[3], gap: space[2] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: radius.md,
    paddingVertical: space[3],
    paddingHorizontal: space[3],
  },
  rowStarred: { borderColor: color.accent, backgroundColor: color.accentWash },
  marker: { fontSize: 18, color: color.ink, width: 22, textAlign: "center" },
  rowTitle: { flex: 1 },
  statsBlock: { marginTop: space[5] },
});
