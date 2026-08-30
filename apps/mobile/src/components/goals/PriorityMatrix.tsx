import { color, space } from "@collegeos/design/native";
import { PRIORITY_MAX, type ScoredGoal } from "@collegeos/core";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Button, SegmentedControl } from "../ui";
import { textStyle } from "../../design/typography";
import { clearPriorityScores, savePriorityScores } from "../../lib/goalsActions";

/**
 * The Priority Matrix for one goal — D49's optional gate on what enters the War Map. Mirrors
 * web's `components/goals/PriorityMatrix.tsx` in copy, order and rules; see that file's header
 * for the reasoning, which is identical on both platforms.
 *
 * The two rules worth repeating where someone might "improve" them:
 *
 * - **An unscored goal shows NO composite.** Not a dash, not a zero. An unevaluated goal is not a
 *   badly-scoring one.
 * - **Nothing ranks or recommends.** The composite sits on the goal it belongs to and nowhere
 *   else, and no threshold turns it into a suggestion to drop something.
 */
export interface PriorityMatrixProps {
  userId: string;
  goalId: number;
  scored: ScoredGoal | undefined;
  onChanged: () => void | Promise<void>;
}

const FIELDS = [
  { key: "visionAlignment", label: "Vision alignment", hint: "How directly this advances the 10-year vision" },
  { key: "leverage", label: "Leverage", hint: "Impact per unit of time invested" },
  { key: "compoundBenefit", label: "Compound benefit", hint: "Whether the benefit compounds or is one-time" },
  {
    key: "opportunityCost",
    label: "Opportunity cost",
    hint: "What you are NOT doing if you choose this. High means giving up a lot.",
  },
] as const;

type FieldKey = (typeof FIELDS)[number]["key"];
type Draft = Partial<Record<FieldKey, number>>;

export function PriorityMatrix({ userId, goalId, scored, onChanged }: PriorityMatrixProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() =>
    scored?.scores == null
      ? {}
      : {
          visionAlignment: scored.scores.visionAlignment,
          leverage: scored.scores.leverage,
          compoundBenefit: scored.scores.compoundBenefit,
          opportunityCost: scored.scores.opportunityCost,
        },
  );

  const complete = FIELDS.every((f) => draft[f.key] != null);

  async function onSave() {
    if (!complete) return;
    setBusy(true);
    setError(null);
    const result = await savePriorityScores(userId, {
      goalId,
      visionAlignment: draft.visionAlignment!,
      leverage: draft.leverage!,
      compoundBenefit: draft.compoundBenefit!,
      opportunityCost: draft.opportunityCost!,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not save those scores.");
      return;
    }
    setOpen(false);
    await onChanged();
  }

  async function onClear() {
    setBusy(true);
    setError(null);
    const result = await clearPriorityScores(userId, goalId);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not clear those scores.");
      return;
    }
    setDraft({});
    setOpen(false);
    await onChanged();
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" hitSlop={6}>
          <Text style={textStyle("label", color.inkMuted)}>
            {open ? "HIDE PRIORITY MATRIX" : scored?.scores != null ? "PRIORITY MATRIX" : "SCORE THIS GOAL (OPTIONAL)"}
          </Text>
        </Pressable>
        {/* Nothing at all when unscored — see the header. */}
        {scored?.composite != null ? (
          <Text style={textStyle("label", color.inkMuted)}>Composite {scored.composite.toFixed(2)}</Text>
        ) : null}
      </View>

      {open ? (
        <View style={styles.body}>
          <Text style={textStyle("bodyS", color.inkFaint)}>
            Four scores, 1–{PRIORITY_MAX}. Entirely optional — a goal works fine unscored, and
            nothing here ranks your goals against each other.
          </Text>
          {FIELDS.map((field) => (
            <View key={field.key} style={styles.field}>
              <SegmentedControl
                label={field.label}
                value={draft[field.key] ?? null}
                onValueChange={(value) => setDraft((prev) => ({ ...prev, [field.key]: value }))}
                min={1}
                max={PRIORITY_MAX}
                disabled={busy}
              />
              <Text style={textStyle("caption", color.inkFaint)}>{field.hint}</Text>
            </View>
          ))}

          {error != null ? <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text> : null}

          <Button onPress={() => void onSave()} disabled={busy || !complete}>
            Save scores
          </Button>
          {scored?.scores != null ? (
            <Button variant="ghost" onPress={() => void onClear()} disabled={busy}>
              Clear scores
            </Button>
          ) : null}
          {!complete ? (
            <Text style={textStyle("caption", color.inkFaint)}>
              All four, or none — a composite over a half-filled matrix would be a number from an
              unfinished answer.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
    paddingTop: space[3],
    gap: space[2],
  },
  header: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space[3] },
  body: { gap: space[3] },
  field: { gap: space[1] },
});
