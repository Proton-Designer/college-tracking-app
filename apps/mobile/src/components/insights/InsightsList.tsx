import type { Insight } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { useState, useTransition } from "react";
import { StyleSheet, Text, View } from "react-native";
import { runExperiment } from "../../lib/insightsActions";
import type { InsightsByTier } from "../../lib/useInsightsData";
import { textStyle } from "../../design/typography";
import { Button, ConfidenceRule, type ConfidenceLineStyle, Input, Textarea } from "../ui";

const TIER_LINE: Record<keyof InsightsByTier, ConfidenceLineStyle> = {
  high: "solid",
  medium: "dashed",
  testing: "dotted",
};

const TIER_LABEL: Record<keyof InsightsByTier, string> = {
  high: "High confidence — measured",
  medium: "Medium confidence — indicated",
  testing: "Testing — hypothesis",
};

/** SCREEN_SPEC §7 — grouped strictly by confidence tier, using the ratified line-style
 *  convention (§6.2): high solid, medium dashed, testing dotted. */
export function InsightsList({ userId, insightsByTier }: { userId: string; insightsByTier: InsightsByTier }) {
  const tiers: (keyof InsightsByTier)[] = ["high", "medium", "testing"];
  const hasAny = tiers.some((t) => insightsByTier[t].length > 0);

  if (!hasAny) {
    return <Text style={textStyle("bodyS", color.inkFaint)}>No insights yet — these build up as the semester&apos;s data accumulates.</Text>;
  }

  return (
    <View style={styles.tierStack}>
      {tiers.map((tier) =>
        insightsByTier[tier].length > 0 ? (
          <View key={tier} style={styles.tierGroup}>
            <Text style={textStyle("label", color.inkMuted)}>{TIER_LABEL[tier]}</Text>
            <View style={styles.list}>
              {insightsByTier[tier].map((insight) => (
                <View key={insight.id} style={styles.item}>
                  <ConfidenceRule lineStyle={TIER_LINE[tier]} ruleColor={color.inkMuted} />
                  <View style={styles.itemContent}>
                    <InsightCard userId={userId} insight={insight} showExperimentAction={tier === "testing"} />
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null,
      )}
    </View>
  );
}

function InsightCard({ userId, insight, showExperimentAction }: { userId: string; insight: Insight; showExperimentAction: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={{ gap: space[2] }}>
      <Text style={textStyle("body", color.ink)}>{insight.claim}</Text>
      <Text style={textStyle("caption", color.inkFaint)}>
        n={insight.sample_size}
        {insight.effect_size != null ? ` · effect ${insight.effect_size.toFixed(2)}` : ""}
      </Text>
      {showExperimentAction ? (
        expanded ? (
          <RunExperimentForm userId={userId} insightId={insight.id} defaultHypothesis={insight.claim} onCancel={() => setExpanded(false)} />
        ) : (
          <View style={{ alignItems: "flex-start" }}>
            <Button variant="secondary" onPress={() => setExpanded(true)}>
              Run an experiment
            </Button>
          </View>
        )
      ) : null}
    </View>
  );
}

function RunExperimentForm({
  userId,
  insightId,
  defaultHypothesis,
  onCancel,
}: {
  userId: string;
  insightId: number;
  defaultHypothesis: string;
  onCancel: () => void;
}) {
  const [hypothesis, setHypothesis] = useState(defaultHypothesis);
  const [protocol, setProtocol] = useState("");
  const [durationDays, setDurationDays] = useState("7");
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleStart() {
    const days = Number(durationDays);
    if (!Number.isFinite(days) || days <= 0) {
      setError("Enter a duration in days.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await runExperiment({
        userId,
        insightId,
        hypothesis,
        ...(protocol.trim() ? { protocol: protocol.trim() } : {}),
        durationDays: days,
      });
      if (!result.ok) {
        setError(result.error ?? "Couldn't start that trial — try again.");
        return;
      }
      setStarted(true);
    });
  }

  if (started) {
    return <Text style={textStyle("bodyS", color.accent)}>Trial started — it&apos;ll show under Active experiments.</Text>;
  }

  return (
    <View style={styles.form}>
      <Textarea label="Hypothesis" value={hypothesis} onChangeText={setHypothesis} rows={2} />
      <Textarea label="What will you measure, and how" value={protocol} onChangeText={setProtocol} rows={2} placeholder="e.g. log minutes distracted each day" />
      <View style={{ width: 96 }}>
        <Input label="Duration (days)" keyboardType="numeric" value={durationDays} onChangeText={setDurationDays} />
      </View>
      {error ? <Text style={textStyle("bodyS", color.riskCritical)}>{error}</Text> : null}
      <View style={styles.formActions}>
        <Button variant="primary" loading={isPending} onPress={handleStart}>
          Start trial
        </Button>
        <Button variant="ghost" onPress={onCancel} disabled={isPending}>
          Cancel
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tierStack: {
    gap: space[7],
  },
  tierGroup: {
    gap: space[3],
  },
  list: {
    gap: space[4],
  },
  item: {
    flexDirection: "row",
    gap: space[3],
  },
  itemContent: {
    flex: 1,
  },
  form: {
    gap: space[3],
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    backgroundColor: color.surface,
    padding: space[4],
  },
  formActions: {
    flexDirection: "row",
    gap: space[2],
  },
});
