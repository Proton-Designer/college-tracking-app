import type { DayCapacity } from "@collegeos/core";
import { color, radius, space } from "@collegeos/design/native";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { fmtMinutes } from "../../lib/formatMinutes";

function weekdayLabel(localDate: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${localDate}T00:00:00Z`));
}

/** Available minutes per day over the near horizon — ported from web's CapacityStrip,
 *  same deliberately-just-the-computed-number choice (no committed-vs-total bar). */
export function CapacityStrip({ days }: { days: DayCapacity[] }) {
  if (days.length === 0) return null;
  const maxMinutes = Math.max(...days.map((d) => d.availableMinutes), 1);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {days.map((d) => (
        <View key={d.date} style={styles.column}>
          <View style={styles.track}>
            <View style={[styles.fill, { height: `${Math.max(4, (d.availableMinutes / maxMinutes) * 100)}%` }]} />
          </View>
          <Text style={textStyle("caption", color.inkFaint)}>{weekdayLabel(d.date)}</Text>
          <Text style={textStyle("caption", color.inkMuted)}>{fmtMinutes(d.availableMinutes)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const TRACK_HEIGHT = 64;

const styles = StyleSheet.create({
  row: {
    gap: space[2],
    paddingBottom: space[1],
  },
  column: {
    width: 56,
    alignItems: "center",
    gap: space[1],
  },
  track: {
    height: TRACK_HEIGHT,
    width: "100%",
    justifyContent: "flex-end",
    borderRadius: radius.sm,
    backgroundColor: color.surfaceSunken,
    overflow: "hidden",
  },
  fill: {
    width: "100%",
    borderRadius: radius.sm,
    backgroundColor: color.accent,
  },
});
