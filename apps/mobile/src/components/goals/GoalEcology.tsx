import { GOAL_RELATIONSHIPS, type GoalEcologyView } from "@collegeos/api";
import type { GoalPair, GoalRelationship } from "@collegeos/core";
import { color, radius, space } from "@collegeos/design/native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Badge, EmptyState, Input, Panel } from "../ui";
import { textStyle } from "../../design/typography";
import { markPair, unmarkPair } from "../../lib/goalsActions";

/**
 * Goal Ecology on the War Map (D49) — the pairs, not a score. Mirrors web's
 * `components/goals/GoalEcology.tsx` in order, copy and rules; that file's header carries the
 * reasoning, and the three rules below are the ones a tidier screen would quietly break.
 *
 * 1. **An unmarked pair reads as UNMARKED, never neutral.** No chip is preselected and the count
 *    says "not marked yet" rather than folding them into the neutral pile.
 * 2. **The examined share tells the truth** — it falls again when a mark is removed, and it is a
 *    fact rather than a target.
 * 3. **Nothing tells you to drop a goal.** Competing pairs surface first, with the user's own
 *    sentence; there is no resolve, no eliminate, no ranking.
 */
export interface GoalEcologyProps {
  userId: string;
  view: GoalEcologyView;
  onChanged: () => void | Promise<void>;
}

/** The three answers, keyed by the enum so the record cannot silently miss one. The ORDER comes
 *  from `GOAL_RELATIONSHIPS` -- the same list the data layer validates against. */
const RELATIONSHIP_COPY: Record<GoalRelationship, { label: string; hint: string }> = {
  competing: { label: "Competing", hint: "Progress on one costs progress on the other" },
  neutral: { label: "Neutral", hint: "They do not conflict, but they share the same hours" },
  synergistic: { label: "Synergistic", hint: "Progress on one accelerates the other" },
};

function pairKey(pair: GoalPair): string {
  return `${pair.a.id}:${pair.b.id}`;
}

function relationshipLabel(relationship: GoalRelationship | null): string {
  // The null case is the load-bearing one. It must never render as "Neutral".
  if (relationship == null) return "Unmarked";
  return RELATIONSHIP_COPY[relationship].label;
}

export function GoalEcology({ userId, view, onChanged }: GoalEcologyProps) {
  const { summary } = view;

  if (view.goals.length < 2) {
    return (
      <EmptyState
        title="One goal has nothing to compete with"
        description="Relationships are a property of a pair. Add a second goal and every pair between them appears here, unmarked, waiting for your read."
      />
    );
  }

  const markedCount = summary.totalPairs - summary.unmarked.length;

  return (
    <View style={styles.container}>
      <View style={styles.headline}>
        <Text style={textStyle("label", color.inkMuted)}>
          {summary.totalPairs} {summary.totalPairs === 1 ? "PAIR" : "PAIRS"}
        </Text>
        <Text style={textStyle("label", color.inkFaint)}>
          {markedCount} marked · {summary.unmarked.length} not marked yet
        </Text>
      </View>

      {summary.competing.length > 0 ? (
        <View style={styles.section}>
          <Text style={textStyle("label", color.ink)}>COMPETING</Text>
          <Text style={textStyle("bodyS", color.inkMuted)}>
            Both of these can matter. Naming the tension is what lets you choose the trade-off
            instead of discovering it in six weeks.
          </Text>
          {summary.competing.map((pair) => (
            <PairCard key={pairKey(pair)} userId={userId} pair={pair} onChanged={onChanged} />
          ))}
        </View>
      ) : null}

      {summary.unmarked.length > 0 ? (
        <View style={styles.section}>
          <Text style={textStyle("label", color.inkMuted)}>NOT MARKED YET</Text>
          <Text style={textStyle("bodyS", color.inkFaint)}>
            Unmarked is not neutral — it is a question nobody has asked yet. Answer the ones you
            have a read on and leave the rest.
          </Text>
          {summary.unmarked.map((pair) => (
            <PairCard key={pairKey(pair)} userId={userId} pair={pair} onChanged={onChanged} />
          ))}
        </View>
      ) : null}

      {summary.synergistic.length > 0 || summary.neutral.length > 0 ? (
        <View style={styles.section}>
          <Text style={textStyle("label", color.inkMuted)}>MARKED</Text>
          {[...summary.synergistic, ...summary.neutral].map((pair) => (
            <PairCard key={pairKey(pair)} userId={userId} pair={pair} onChanged={onChanged} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function PairCard({
  userId,
  pair,
  onChanged,
}: {
  userId: string;
  pair: GoalPair;
  onChanged: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState(pair.note ?? "");
  const [editing, setEditing] = useState(pair.relationship == null);

  async function onMark(relationship: GoalRelationship) {
    setBusy(true);
    setError(null);
    const result = await markPair(userId, {
      goalAId: pair.a.id,
      goalBId: pair.b.id,
      relationship,
      note,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not save that.");
      return;
    }
    setEditing(false);
    await onChanged();
  }

  async function onUnmark() {
    setBusy(true);
    setError(null);
    const result = await unmarkPair(userId, pair.a.id, pair.b.id);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not clear that mark.");
      return;
    }
    setNote("");
    setEditing(true);
    await onChanged();
  }

  return (
    <Panel>
      <View style={styles.pairHeader}>
        <Text style={[textStyle("body", color.ink), styles.pairTitle]}>
          {pair.a.title} ↔ {pair.b.title}
        </Text>
        <Badge tone={pair.relationship === "competing" ? "accent" : "neutral"}>
          {relationshipLabel(pair.relationship)}
        </Badge>
      </View>

      {/* The user's own sentence, shown wherever the pair is. This is what they reread in ninety
          days, and what makes a competing pair actionable rather than merely flagged. */}
      {pair.note != null && !editing ? (
        <Text style={[textStyle("bodyS", color.inkMuted), styles.note]}>{pair.note}</Text>
      ) : null}

      {editing ? (
        <View style={styles.editor}>
          <View accessibilityRole="radiogroup" accessibilityLabel={`How ${pair.a.title} and ${pair.b.title} relate`} style={styles.options}>
            {GOAL_RELATIONSHIPS.map((value) => {
              const copy = RELATIONSHIP_COPY[value];
              // No option is ever preselected on an unmarked pair -- `pair.relationship` is null
              // there, so every chip reads unchecked. That is D49 in the markup.
              const selected = pair.relationship === value;
              return (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: busy }}
                  disabled={busy}
                  onPress={() => void onMark(value)}
                  style={[styles.option, { borderColor: selected ? color.accent : color.hairline }]}
                >
                  <Text style={textStyle("bodyS", selected ? color.ink : color.inkMuted)}>{copy.label}</Text>
                  <Text style={textStyle("caption", color.inkFaint)}>{copy.hint}</Text>
                </Pressable>
              );
            })}
          </View>
          <Input
            label="Why, in your words (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="What actually collides here"
            editable={!busy}
          />
          {pair.relationship != null ? (
            <Pressable onPress={() => setEditing(false)} accessibilityRole="button" hitSlop={6}>
              <Text style={textStyle("label", color.inkFaint)}>CANCEL</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <View style={styles.actions}>
          <Pressable onPress={() => setEditing(true)} accessibilityRole="button" hitSlop={6} disabled={busy}>
            <Text style={textStyle("label", color.inkFaint)}>CHANGE</Text>
          </Pressable>
          {/* Back to unmarked, not to neutral. */}
          <Pressable onPress={() => void onUnmark()} accessibilityRole="button" hitSlop={6} disabled={busy}>
            <Text style={textStyle("label", color.inkFaint)}>UNMARK</Text>
          </Pressable>
        </View>
      )}

      {error != null ? (
        <Text style={[textStyle("bodyS", color.riskCritical), styles.note]}>{error}</Text>
      ) : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  container: { gap: space[5] },
  headline: { flexDirection: "row", alignItems: "baseline", gap: space[4], flexWrap: "wrap" },
  section: { gap: space[3] },
  pairHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: space[3] },
  pairTitle: { flex: 1 },
  note: { marginTop: space[2] },
  editor: { marginTop: space[3], gap: space[3] },
  options: { gap: space[2] },
  option: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space[3], paddingVertical: space[2], gap: space[1] },
  actions: { marginTop: space[3], flexDirection: "row", gap: space[4] },
});
