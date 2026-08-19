import type { CategoryResult, GradeScenarioHypothetical, RequiredScoreResult } from "@collegeos/core";
import { color, space } from "@collegeos/design/native";
import { useState, useTransition } from "react";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { runGradeScenario, runRequiredScore } from "../../lib/courseActions";
import { Button, Input, Panel } from "../ui";

function formatPct(pct: number): string {
  return `${Math.round(pct * 10) / 10}%`;
}

function verdictProse(result: RequiredScoreResult, targetPct: number): string {
  switch (result.verdict) {
    case "final":
      return result.metTarget
        ? `Grade is final at ${formatPct(result.finalGrade ?? 0)} — target met.`
        : `Grade is final at ${formatPct(result.finalGrade ?? 0)} — target of ${targetPct}% was not met.`;
    case "impossible":
      return `Not reachable. The best possible final grade from here is ${formatPct(result.maxAchievableGrade ?? 0)}.`;
    case "secured":
      return `Already secured — an average as low as ${formatPct(result.minRequiredToHold ?? 0)} on what's left still hits ${targetPct}%.`;
    case "onTrack":
      return `Needs an average of ${formatPct(result.neededPct)} on the remaining ${formatPct(result.remainingWeightPct)} of weight to hit ${targetPct}%.`;
  }
}

/** Ported from web's ScenarioPlanner — same two tools (required score, hypothetical
 *  preview), same verdict prose. Mobile calls the same packages/api compute functions
 *  directly from the client (no server-action layer on mobile), matching every other
 *  mobile write path. */
export function ScenarioPlanner({
  userId,
  courseId,
  categoryResults,
  categoryNameById,
  defaultTargetPct,
}: {
  userId: string;
  courseId: number;
  categoryResults: CategoryResult[];
  categoryNameById: Map<string, string>;
  defaultTargetPct: number | null;
}) {
  const unresolved = categoryResults.filter((c) => !c.resolved);
  const nameFor = (categoryId: string) => categoryNameById.get(categoryId) ?? `Category ${categoryId}`;

  const [targetInput, setTargetInput] = useState(String(defaultTargetPct ?? 90));
  const [requiredResult, setRequiredResult] = useState<RequiredScoreResult | null>(null);
  const [requiredError, setRequiredError] = useState<string | null>(null);
  const [isPendingRequired, startRequiredTransition] = useTransition();

  const [hypotheticalInputs, setHypotheticalInputs] = useState<Record<string, string>>({});
  const [scenarioGrade, setScenarioGrade] = useState<number | null | undefined>(undefined);
  const [scenarioError, setScenarioError] = useState<string | null>(null);
  const [isPendingScenario, startScenarioTransition] = useTransition();

  function handleCalculateRequired() {
    const targetPct = Number(targetInput);
    if (!Number.isFinite(targetPct)) {
      setRequiredError("Enter a number.");
      return;
    }
    setRequiredError(null);
    startRequiredTransition(async () => {
      const result = await runRequiredScore(userId, courseId, targetPct);
      if (!result.ok) {
        setRequiredError(result.error);
        return;
      }
      setRequiredResult(result.data);
    });
  }

  function handlePreviewScenario() {
    const hypotheticals: GradeScenarioHypothetical[] = Object.entries(hypotheticalInputs)
      .filter(([, v]) => v.trim() !== "")
      .map(([categoryId, v]) => ({ categoryId, assumedPct: Number(v) }));

    if (hypotheticals.some((h) => !Number.isFinite(h.assumedPct))) {
      setScenarioError("Enter a number for each filled-in category.");
      return;
    }
    setScenarioError(null);
    startScenarioTransition(async () => {
      const result = await runGradeScenario(userId, courseId, hypotheticals);
      if (!result.ok) {
        setScenarioError(result.error);
        return;
      }
      setScenarioGrade(result.data.projectedGrade);
    });
  }

  return (
    <View style={styles.stack}>
      <Panel title="What do I need?">
        <View style={styles.panelStack}>
          <View style={styles.inputRow}>
            <View style={styles.targetInput}>
              <Input label="Target grade" keyboardType="numeric" value={targetInput} onChangeText={setTargetInput} />
            </View>
            <Button variant="secondary" loading={isPendingRequired} onPress={handleCalculateRequired}>
              Calculate
            </Button>
          </View>
          {requiredError ? <Text style={textStyle("bodyS", color.riskCritical)}>{requiredError}</Text> : null}
          {requiredResult ? (
            <View style={styles.resultBlock}>
              <Text style={textStyle("body", color.ink)}>{verdictProse(requiredResult, Number(targetInput))}</Text>
              {requiredResult.perRemainingCategory.length > 0 ? (
                <View style={styles.resultList}>
                  {requiredResult.perRemainingCategory.map((c) => (
                    <Text key={c.categoryId} style={textStyle("caption", color.inkFaint)}>
                      {nameFor(c.categoryId)}: {formatPct(c.requiredPct)}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </Panel>

      {unresolved.length > 0 ? (
        <Panel title="What if…">
          <View style={styles.panelStack}>
            <View style={styles.hypRow}>
              {unresolved.map((c) => (
                <View key={c.categoryId} style={styles.hypInput}>
                  <Input
                    label={nameFor(c.categoryId)}
                    keyboardType="numeric"
                    placeholder="—"
                    value={hypotheticalInputs[c.categoryId] ?? ""}
                    onChangeText={(v) => setHypotheticalInputs((prev) => ({ ...prev, [c.categoryId]: v }))}
                  />
                </View>
              ))}
            </View>
            <Button variant="secondary" loading={isPendingScenario} onPress={handlePreviewScenario}>
              Preview
            </Button>
            {scenarioError ? <Text style={textStyle("bodyS", color.riskCritical)}>{scenarioError}</Text> : null}
            {scenarioGrade !== undefined ? (
              <Text style={styles.scenarioResult}>
                {scenarioGrade == null ? "Still nothing to project from." : `Projected grade: ${formatPct(scenarioGrade)}`}
              </Text>
            ) : null}
          </View>
        </Panel>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: space[6],
  },
  panelStack: {
    gap: space[3],
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: space[3],
  },
  targetInput: {
    width: 96,
  },
  resultBlock: {
    gap: space[1],
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
  resultList: {
    gap: 2,
    marginTop: space[1],
  },
  hypRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[3],
  },
  hypInput: {
    width: 96,
  },
  scenarioResult: {
    ...textStyle("body", color.ink),
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
});
