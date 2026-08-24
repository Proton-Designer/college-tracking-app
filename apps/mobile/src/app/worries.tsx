import type { WorryRow } from "@collegeos/api";
import { color, radius, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Button, Input, Panel } from "../components/ui";
import { textStyle } from "../design/typography";
import { addWorry, loadWorries, markWorryDone } from "../lib/worryActions";
import { useAuthSession } from "../lib/useAuthSession";

/**
 * The Worry List -- BLUEPRINT Part IV-B. A capture inbox all week; Monday Hour 1 clears it.
 *
 * Capture is deliberately the cheapest write in the app: one field, one button, no
 * categorisation, no due date. The value of a worry inbox is that writing it down takes
 * less effort than continuing to carry it, and every extra field erodes that trade.
 */
export default function WorriesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session: authSession } = useAuthSession();
  const userId = authSession?.user.id ?? null;

  const [worries, setWorries] = useState<WorryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (userId == null) return;
    const result = await loadWorries(userId);
    if (result.ok) setWorries(result.data);
    else setError(result.error);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onAdd = useCallback(async () => {
    if (userId == null) return;
    setBusy(true);
    const result = await addWorry(userId, draft);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not save that.");
      return;
    }
    setDraft("");
    await refresh();
  }, [userId, draft, refresh]);

  const onDone = useCallback(
    async (worryId: number) => {
      if (userId == null) return;
      const result = await markWorryDone(userId, worryId);
      if (!result.ok) {
        setError(result.error ?? "Could not update that.");
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

        <Text style={textStyle("displayM", color.ink)}>Worry List</Text>
        <Text style={textStyle("bodyS", color.inkMuted)}>
          Park it here, keep working. Monday&apos;s first Hour clears the list.
        </Text>

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        <Panel>
          <Input
            label="What's circling?"
            value={draft}
            onChangeText={setDraft}
            placeholder="One line, then let it go"
            editable={!busy}
            onSubmitEditing={onAdd}
            returnKeyType="done"
          />
          <View style={styles.spacedTop}>
            <Button onPress={onAdd} disabled={busy || draft.trim().length === 0}>
              Park it
            </Button>
          </View>
        </Panel>

        {loading ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>Loading…</Text>
        ) : worries.length === 0 ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>Nothing parked. Good.</Text>
        ) : (
          worries.map((w) => (
            <View key={w.id} style={styles.row}>
              <Text style={[textStyle("body", color.ink), styles.rowText]}>{w.text}</Text>
              <Pressable
                onPress={() => void onDone(w.id)}
                accessibilityRole="button"
                accessibilityLabel={`Mark handled: ${w.text}`}
                hitSlop={8}
              >
                <Text style={textStyle("bodyS", color.inkMuted)}>Handled</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space[5], gap: space[4] },
  spacedTop: { marginTop: space[2] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    padding: space[3],
  },
  rowText: { flex: 1 },
});
