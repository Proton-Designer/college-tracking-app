import type { DeliverableRisk } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { daysRemainingLabel } from "../../lib/dates";
import { explainMissingFactors, explainTopFactors } from "../../lib/riskExplain";
import { RiskPill } from "../ui";

/** The "Why:" list — the full explanation trace as evidence, not a debug view. Ported
 *  from web's CourseRiskPanel. */
export function CourseRiskPanel({ deliverableRisks, today }: { deliverableRisks: DeliverableRisk[]; today: string }) {
  if (deliverableRisks.length === 0) {
    return <Text style={textStyle("bodyS", color.inkFaint)}>Nothing open in this course right now.</Text>;
  }

  const sorted = [...deliverableRisks].sort((a, b) => b.result.score - a.result.score);

  return (
    <View style={styles.list}>
      {sorted.map((dr, i) => {
        const reasons = explainTopFactors(dr.result.trace, 8);
        const caveats = explainMissingFactors(dr.result.missingFactors);
        return (
          <View key={dr.deliverableId} style={[styles.row, i < sorted.length - 1 ? styles.rowDivider : undefined]}>
            <View style={styles.header}>
              <View style={styles.titleCol}>
                <Text style={textStyle("body", color.ink)}>{dr.title}</Text>
                <Text style={textStyle("caption", color.inkFaint)}>{daysRemainingLabel(today, dr.input.dueDate)}</Text>
              </View>
              <View style={styles.riskRow}>
                <RiskPill band={dr.result.band} label={dr.result.band.toUpperCase()} />
                <Text style={textStyle("bodyS", color.inkFaint)}>{dr.result.score}</Text>
              </View>
            </View>
            {reasons.length > 0 ? (
              <View style={styles.reasonList}>
                {reasons.map((reason) => (
                  <Text key={reason} style={textStyle("bodyS", color.inkMuted)}>
                    · {reason}
                  </Text>
                ))}
              </View>
            ) : null}
            {caveats.length > 0 ? (
              <View style={styles.reasonList}>
                {caveats.map((caveat) => (
                  <Text key={caveat} style={textStyle("caption", color.inkFaint)}>
                    {caveat}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: space[5],
  },
  row: {
    gap: space[2],
  },
  rowDivider: {
    paddingBottom: space[5],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
  },
  titleCol: {
    flex: 1,
    gap: 2,
  },
  riskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
  },
  reasonList: {
    gap: 2,
    paddingLeft: space[3],
  },
});
