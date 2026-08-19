import { color, space } from "@collegeos/design/native";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import type { BackplanChain as BackplanChainData } from "../../lib/loadBackplanChains";

function phaseLabel(phase: string): string {
  return phase.replace(/_/g, " ");
}

/** The backplan's milestone chain for one deliverable, expanded inline — ported from
 *  web's BackplanChain. A compressed plan is flagged, an infeasible one is unmissable. */
export function BackplanChain({ chain }: { chain: BackplanChainData | undefined }) {
  if (!chain) return null;
  const { backplan, milestones } = chain;

  return (
    <View style={styles.container}>
      {backplan.infeasible ? (
        <Text style={textStyle("bodyS", color.riskCritical)}>
          Backplan infeasible — short {backplan.shortfall_minutes} min even with everything droppable dropped.
        </Text>
      ) : backplan.compressed ? (
        <Text style={textStyle("bodyS", color.riskHigh)}>
          Backplan compressed{backplan.dropped_phases.length > 0 ? ` — dropped: ${backplan.dropped_phases.map(phaseLabel).join(", ")}` : ""}.
        </Text>
      ) : null}
      {milestones.length > 0 ? (
        <View style={styles.milestoneRow}>
          {milestones.map((m) => (
            <Text key={m.id} style={[textStyle("caption", m.completed ? color.inkFaint : color.inkMuted), m.completed ? styles.strike : undefined]}>
              {phaseLabel(m.phase)} · {m.milestone_date} · {m.minutes}m
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: space[1],
    gap: space[1],
  },
  milestoneRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[3],
  },
  strike: {
    textDecorationLine: "line-through",
  },
});
