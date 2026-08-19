import type { PlanningExecutionResult } from "@collegeos/core";
import { color, space } from "@collegeos/design/native";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { Metric } from "../ui";

const DIAGNOSIS_PROSE: Record<PlanningExecutionResult["diagnosis"], string> = {
  overplanning: "Low planning quality and low execution — yesterday's plan didn't match reality, and what was planned didn't get done either.",
  executionProblem: "Planning was realistic, but execution fell short — the plan itself wasn't the problem.",
  underplanning: "Execution was strong against a plan that undershot real capacity — there was room for more than was planned.",
  calibrated: "Plan and execution both landed close to reality yesterday.",
};

/** Ported from web's PlanningExecutionQuadrant. Scoped to yesterday -- the most recent
 *  complete day with a submitted review. */
export function PlanningExecutionQuadrant({ result }: { result: PlanningExecutionResult | null }) {
  if (!result) {
    return <Text style={textStyle("bodyS", color.inkFaint)}>No review submitted yesterday to diagnose against.</Text>;
  }

  return (
    <View style={{ gap: space[4] }}>
      <View style={styles.metricRow}>
        <Metric label="Execution quality" value={Math.round(result.executionQuality)} unit="%" />
        <Metric label="Planning quality" value={Math.round(result.planningQuality)} unit="%" />
        {result.startDelayMin != null ? (
          <Metric label="Start delay" value={result.startDelayMin >= 0 ? `+${result.startDelayMin}` : result.startDelayMin} unit="min" />
        ) : null}
      </View>
      <Text style={textStyle("body", color.ink)}>{DIAGNOSIS_PROSE[result.diagnosis]}</Text>
      <Text style={textStyle("caption", color.inkFaint)}>
        MITs {result.mitCompleted}/{result.mitPlanned}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  metricRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[7],
  },
});
