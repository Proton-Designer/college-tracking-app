import type { CardRow, CardType } from "@collegeos/api";
import { color, radius, space } from "@collegeos/design/native";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Button, Input, Panel } from "../components/ui";
import { textStyle } from "../design/typography";
import { addCard, loadCards, retireCard } from "../lib/cardsActions";
import { useAuthSession } from "../lib/useAuthSession";

/** Display order and labels. Part VIII's tiny-vocabulary rule: these are the in-app words. */
const TYPES: { value: CardType; label: string; hint: string }[] = [
  { value: "goal", label: "Goals", hint: "The five, each with its number and deadline." },
  { value: "motivation", label: "Motivation", hint: "Short and private. Why you're doing this." },
  { value: "thought_habit", label: "Thought habits", hint: "When X, think Y." },
  { value: "trait", label: "2.0 traits", hint: "Beliefs, character, skills of the next version." },
  { value: "tenx", label: "10X", hint: "One static card. Shown outside rotation." },
];

/**
 * The Cards library -- BLUEPRINT Part IV-C. This replaces printing and posting documents
 * on a wall while keeping the read-it-again mechanic: cards surface in rotation at
 * End-of-Hour, and are edited here.
 */
export default function CardsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session: authSession } = useAuthSession();
  const userId = authSession?.user.id ?? null;

  const [cards, setCards] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [draftType, setDraftType] = useState<CardType>("goal");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (userId == null) return;
    const result = await loadCards(userId);
    if (result.ok) setCards(result.data);
    else setError(result.error);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onAdd = useCallback(async () => {
    if (userId == null) return;
    setBusy(true);
    setError(null);
    const result = await addCard(userId, draftType, draft);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not add the card.");
      return;
    }
    setDraft("");
    await refresh();
  }, [userId, draftType, draft, refresh]);

  const onRetire = useCallback(
    async (cardId: number) => {
      if (userId == null) return;
      const result = await retireCard(userId, cardId);
      if (!result.ok) {
        setError(result.error ?? "Could not retire the card.");
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

        <Text style={textStyle("displayM", color.ink)}>Cards</Text>
        <Text style={textStyle("bodyS", color.inkMuted)}>
          Your wall, digitized. Three of these rotate at the end of every Hour.
        </Text>

        {error != null ? (
          <Panel>
            <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text>
          </Panel>
        ) : null}

        <Panel>
          <Text style={textStyle("label", color.inkMuted)}>Add a card</Text>
          <View style={styles.typeRow}>
            {TYPES.map((t) => (
              <Pressable
                key={t.value}
                onPress={() => setDraftType(t.value)}
                accessibilityRole="button"
                style={[styles.typeChip, draftType === t.value ? styles.typeChipActive : null]}
              >
                <Text
                  style={textStyle("bodyS", draftType === t.value ? color.surface : color.ink)}
                >
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[textStyle("bodyS", color.inkMuted), styles.spacedTop]}>
            {TYPES.find((t) => t.value === draftType)?.hint}
          </Text>
          <View style={styles.spacedTop}>
            <Input
              label="Text"
              value={draft}
              onChangeText={setDraft}
              placeholder="One line"
              editable={!busy}
            />
          </View>
          <View style={styles.spacedTop}>
            <Button onPress={onAdd} disabled={busy || draft.trim().length === 0}>
              Add card
            </Button>
          </View>
        </Panel>

        {loading ? (
          <Text style={textStyle("bodyS", color.inkMuted)}>Loading…</Text>
        ) : (
          TYPES.map((t) => {
            const group = cards.filter((c) => c.type === t.value && c.active);
            if (group.length === 0) return null;
            return (
              <View key={t.value} style={styles.group}>
                <Text style={textStyle("label", color.inkMuted)}>{t.label}</Text>
                {group.map((c) => (
                  <View key={c.id} style={styles.cardRow}>
                    <Text style={[textStyle("body", color.ink), styles.cardText]}>{c.text}</Text>
                    <Pressable
                      onPress={() => void onRetire(c.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Retire card: ${c.text}`}
                      hitSlop={8}
                    >
                      <Text style={textStyle("bodyS", color.inkMuted)}>Retire</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space[5], gap: space[4] },
  spacedTop: { marginTop: space[2] },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[3] },
  typeChip: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.pill,
    paddingVertical: space[2],
    paddingHorizontal: space[3],
  },
  typeChipActive: { backgroundColor: color.accent, borderColor: color.accent },
  group: { gap: space[2] },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    borderWidth: 1,
    borderColor: color.hairline,
    borderRadius: radius.md,
    backgroundColor: color.surface,
    padding: space[3],
  },
  cardText: { flex: 1 },
});
