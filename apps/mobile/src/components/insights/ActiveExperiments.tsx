import { daysBetween } from "@collegeos/core";
import { color, space } from "@collegeos/design/native";
import { StyleSheet, Text, View } from "react-native";
import type { ActiveExperiment } from "../../lib/useInsightsData";
import { textStyle } from "../../design/typography";
import { Panel } from "../ui";

function meanBy<T>(items: T[], value: (item: T) => number): number {
  return items.reduce((sum, item) => sum + value(item), 0) / items.length;
}

/** Ported from web's ActiveExperiments -- no stored baseline/hypothesized-direction on
 *  `experiments`, so this shows the trial's own first-half-vs-second-half movement
 *  ("so far"), not a verdict against a baseline that doesn't exist. */
export function ActiveExperiments({ experiments, today }: { experiments: ActiveExperiment[]; today: string }) {
  if (experiments.length === 0) {
    return <Text style={textStyle("bodyS", color.inkFaint)}>No experiments running right now.</Text>;
  }

  return (
    <View style={styles.list}>
      {experiments.map(({ experiment, measurements }) => {
        const elapsedDays = daysBetween(experiment.start_date, today);
        const totalDays = experiment.end_date ? daysBetween(experiment.start_date, experiment.end_date) : null;
        const metrics = [...new Set(measurements.map((m) => m.metric))];

        const sorted = [...measurements].sort((a, b) => a.local_date.localeCompare(b.local_date));
        const mid = Math.floor(sorted.length / 2);
        const soFar =
          sorted.length >= 4
            ? { first: meanBy(sorted.slice(0, mid), (m) => m.value), second: meanBy(sorted.slice(mid), (m) => m.value) }
            : null;

        return (
          <Panel key={experiment.id} style={styles.panel}>
            <Text style={textStyle("body", color.ink)}>{experiment.hypothesis}</Text>
            <Text style={textStyle("caption", color.inkFaint)}>
              Day {elapsedDays}
              {totalDays != null ? ` of ${totalDays}` : ""} · {metrics.length > 0 ? metrics.join(", ") : "no measurements logged yet"}
            </Text>
            {soFar ? (
              <Text style={textStyle("bodyS", color.inkMuted)}>
                So far: {soFar.first.toFixed(1)} → {soFar.second.toFixed(1)} ({sorted.length} measurements — still provisional)
              </Text>
            ) : null}
          </Panel>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: space[3],
  },
  panel: {
    gap: space[2],
  },
});
