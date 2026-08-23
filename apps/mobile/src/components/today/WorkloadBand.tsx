import type { WorkloadLevels } from "@collegeos/core";
import { color, space } from "@collegeos/design/native";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { fmtMinutes } from "../../lib/formatMinutes";

export function WorkloadBand({ workload }: { workload: WorkloadLevels }) {
  const { floorMinutes, targetMinutes, capacityMinutes, floorExceedsCapacity, stretchItems } = workload;
  const floorPct = capacityMinutes > 0 ? Math.min(100, (floorMinutes / capacityMinutes) * 100) : 0;
  const targetPct = capacityMinutes > 0 ? Math.min(100, (targetMinutes / capacityMinutes) * 100) : 0;
  const floorEqualsTarget = floorMinutes === targetMinutes;

  return (
    <View style={styles.container}>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            { width: `${floorPct}%`, backgroundColor: floorExceedsCapacity ? color.riskCritical : color.accent },
          ]}
        />
        {!floorExceedsCapacity ? (
          <View style={[styles.fill, { width: `${Math.max(0, targetPct - floorPct)}%`, backgroundColor: color.accentWash }]} />
        ) : null}
      </View>

      <Text style={textStyle("bodyS", color.inkMuted)}>
        {floorEqualsTarget ? (
          <Text style={textStyle("label", color.inkMuted)}>Floor = target </Text>
        ) : (
          <Text style={textStyle("label", color.inkMuted)}>Floor </Text>
        )}
        {fmtMinutes(floorMinutes)}
        {!floorEqualsTarget ? (
          <>
            {"  ·  "}
            <Text style={textStyle("label", color.inkMuted)}>Target </Text>
            {fmtMinutes(targetMinutes)}
          </>
        ) : null}
        {" "}
        <Text style={textStyle("bodyS", color.inkMuted)}>of ~{fmtMinutes(capacityMinutes)} realistic today.</Text>
      </Text>

      {stretchItems.length > 0 ? (
        <Text style={textStyle("bodyS", color.inkMuted)}>
          +{stretchItems.length} more {stretchItems.length === 1 ? "task" : "tasks"} if there&apos;s time left over.
        </Text>
      ) : null}

      {floorExceedsCapacity ? (
        <Text style={textStyle("bodyS", color.riskCritical)}>
          Floor alone exceeds today&apos;s realistic capacity — something non-negotiable won&apos;t fit without
          cutting something else.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space[3],
  },
  track: {
    flexDirection: "row",
    height: 12,
    width: "100%",
    borderRadius: 999,
    backgroundColor: color.surfaceSunken,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
  },
});
