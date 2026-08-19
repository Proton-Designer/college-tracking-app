import type { Course, DayView } from "@collegeos/api";
import { daysBetween } from "@collegeos/core";
import { color, space } from "@collegeos/design/native";
import { StyleSheet, Text, View } from "react-native";
import { RiskPill } from "../ui/RiskPill";
import { textStyle } from "../../design/typography";
import { daysRemainingLabel } from "../../lib/dates";
import { explainTopFactors } from "../../lib/riskExplain";

export function DeadlineRadar({
  today,
  deliverables,
  deliverableRisks,
  courses,
}: {
  today: string;
  deliverables: DayView["upcomingDeliverables"];
  deliverableRisks: DayView["risk"]["deliverableRisks"];
  courses: Record<number, Course>;
}) {
  const riskByDeliverable = new Map(deliverableRisks.map((r) => [r.deliverableId, r]));

  const top5 = [...deliverables]
    .sort((a, b) => daysBetween(today, a.localDueDate) - daysBetween(today, b.localDueDate))
    .slice(0, 5);

  if (top5.length === 0) {
    return <Text style={textStyle("body", color.inkMuted)}>Nothing on the horizon in the next two weeks.</Text>;
  }

  return (
    <View style={styles.list}>
      {top5.map((d, i) => {
        const risk = riskByDeliverable.get(d.id);
        const course = courses[d.courseId];
        const showReason = risk && (risk.result.band === "high" || risk.result.band === "critical");
        const reasons = showReason ? explainTopFactors(risk.result.trace, 1) : [];

        return (
          <View key={d.id} style={[styles.row, i === top5.length - 1 ? styles.rowLast : styles.rowBorder]}>
            <View style={styles.rowTop}>
              <View style={styles.rowText}>
                <Text style={textStyle("body", color.ink)}>{d.title}</Text>
                <Text style={textStyle("caption", color.inkFaint)}>
                  {course?.code ?? "—"} · {daysRemainingLabel(today, d.localDueDate)}
                </Text>
              </View>
              {risk ? <RiskPill band={risk.result.band} label={risk.result.band.toUpperCase()} /> : null}
            </View>
            {reasons.length > 0 ? <Text style={textStyle("bodyS", color.inkMuted)}>{reasons[0]}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 0,
  },
  row: {
    gap: space[1],
    paddingBottom: space[4],
    marginBottom: space[4],
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  rowLast: {
    paddingBottom: 0,
    marginBottom: 0,
  },
  rowTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
});
