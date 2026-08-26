import { getOwnProfile, getUserLocalToday, createTask, NIGHT_PLAN_DEFAULT_CATEGORY } from "@collegeos/api";
import { localTimeToInstant, parseUtterance, type ParsedUtterance } from "@collegeos/core";
import { color, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Button, DatePicker, Panel, Textarea, TimePicker } from "../components/ui";
import { textStyle } from "../design/typography";
import { getMobileSupabaseClient } from "../lib/supabase/client";
import { useAuthSession } from "../lib/useAuthSession";

/**
 * Voice capture, FOLLOWUPS V2 Phase 1: the keyboard's own dictation key is the mic
 * (best accuracy on iOS, zero vendors), the parse is DETERMINISTIC (core's
 * parseUtterance -- Law 2), and nothing persists without the confirm preview. The
 * preview is editable precisely because a parse is an interpretation: a wrong silent
 * time is worse than typing, because the user stops checking (V2's closing rule).
 * Writes through createTask so a spoken task is indistinguishable from a typed one.
 */
export default function CaptureScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session: authSession } = useAuthSession();
  const userId = authSession?.user.id ?? null;

  const [utterance, setUtterance] = useState("");
  const [dateOverride, setDateOverride] = useState<string | null>(null);
  const [timeOverride, setTimeOverride] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedTitle, setSavedTitle] = useState<string | null>(null);

  // Parse against the wall clock on each keystroke; cheap and pure.
  const parsed: ParsedUtterance = useMemo(() => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return parseUtterance(utterance, { today, nowMinutesIntoDay: now.getHours() * 60 + now.getMinutes() });
  }, [utterance]);

  const effectiveDate = dateOverride ?? parsed.date;
  const effectiveTime =
    timeOverride ?? (parsed.time != null ? `${String(parsed.time.hour).padStart(2, "0")}:${String(parsed.time.minute).padStart(2, "0")}` : null);

  const onSave = useCallback(async () => {
    if (userId == null || parsed.title.trim() === "") return;
    setBusy(true);
    setError(null);
    const client = getMobileSupabaseClient();
    const profileResult = await getOwnProfile(client);
    if (!profileResult.ok) {
      setBusy(false);
      setError(profileResult.error.message);
      return;
    }
    const timezone = profileResult.data.timezone;
    const plannedDate = effectiveDate ?? getUserLocalToday(timezone, new Date());
    let plannedStartAt: string | null = null;
    if (effectiveTime != null) {
      const [h, m] = effectiveTime.split(":").map(Number);
      plannedStartAt = localTimeToInstant(plannedDate, h!, m!, timezone);
    }
    const result = await createTask(client, {
      user_id: userId,
      title: parsed.title.trim(),
      category: NIGHT_PLAN_DEFAULT_CATEGORY,
      planned_date: plannedDate,
      ...(plannedStartAt != null ? { planned_start_at: plannedStartAt } : {}),
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setSavedTitle(parsed.title.trim());
    setUtterance("");
    setDateOverride(null);
    setTimeOverride(null);
  }, [userId, parsed.title, effectiveDate, effectiveTime]);

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

        <Text style={textStyle("displayM", color.ink)}>Capture</Text>
        <Text style={textStyle("bodyS", color.inkMuted)}>
          Say it or type it — the mic key on the keyboard is the voice input. You confirm before
          anything is saved.
        </Text>

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        {savedTitle != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.ink)}>Saved: “{savedTitle}”. It&apos;s on Today.</Text>
          </Panel>
        ) : null}

        <Panel>
          <Textarea
            label="What needs doing?"
            value={utterance}
            onChangeText={(t) => {
              setUtterance(t);
              setSavedTitle(null);
              // A new utterance invalidates manual overrides of the OLD parse.
              setDateOverride(null);
              setTimeOverride(null);
            }}
            placeholder="submit my econ homework tomorrow at 6pm"
            editable={!busy}
          />
        </Panel>

        {utterance.trim() !== "" ? (
          <Panel>
            <Text style={textStyle("label", color.inkMuted)}>Preview — edit anything, then save</Text>
            <Text style={[textStyle("bodyL", color.ink), styles.spacedTop]}>
              {parsed.title || "(no title yet)"}
            </Text>
            {parsed.matched.length > 0 ? (
              <Text style={[textStyle("caption", color.inkFaint), styles.spacedTop]}>
                Understood: {parsed.matched.join(" · ")}
              </Text>
            ) : null}
            <View style={styles.spacedTop}>
              <DatePicker
                label={effectiveDate == null ? "Date — none heard; defaults to today" : "Date"}
                value={effectiveDate}
                onValueChange={setDateOverride}
              />
            </View>
            <View style={styles.spacedTop}>
              <TimePicker label="Start time (optional)" value={effectiveTime} onValueChange={setTimeOverride} />
            </View>
            <Text style={[textStyle("caption", color.inkFaint), styles.spacedTop]}>
              Filed as Admin — change the category on Today.
            </Text>
            <View style={styles.spacedTop}>
              <Button onPress={onSave} loading={busy} disabled={busy || parsed.title.trim() === ""}>
                Save task
              </Button>
            </View>
          </Panel>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space[5], gap: space[4] },
  spacedTop: { marginTop: space[3] },
});
