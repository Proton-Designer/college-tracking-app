import type { DayCapacity } from "@collegeos/core";
import { color, radius, space } from "@collegeos/design/native";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { fmtMinutes } from "../../lib/formatMinutes";

function weekdayLabel(localDate: string): string {
  return new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${localDate}T00:00:00Z`));
}

/** Uncommitted minutes per day over the near horizon -- ported from web's CapacityStrip,
 *  same deliberately-just-the-computed-number choice (no committed-vs-total bar).
 *
 *  The numbers cluster tightly (typically ~12h-17h), so a tall solid bar chart exaggerates
 *  a flat, low-information range into the visually dominant element on the page. The
 *  number is the actual content; the bar is now a minor underline-style indicator beneath
 *  it, not the other way around. */
export function CapacityStrip({ days }: { days: DayCapacity[] }) {
  if (days.length === 0) return null;
  const maxMinutes = Math.max(...days.map((d) => d.availableMinutes), 1);

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {days.map((d) => (
        <View key={d.date} style={styles.column}>
          <Text style={textStyle("caption", color.inkFaint)}>{weekdayLabel(d.date)}</Text>
          <Text style={textStyle("caption", color.ink)}>{fmtMinutes(d.availableMinutes)}</Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(8, (d.availableMinutes / maxMinutes) * 100)}%` }]} />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: space[3],
    paddingBottom: space[1],
  },
  column: {
    width: 56,
    alignItems: "center",
    gap: space[1],
  },
  track: {
    height: 3,
    width: "100%",
    borderRadius: radius.pill,
    backgroundColor: color.surfaceSunken,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: color.accent,
    opacity: 0.5,
  },
});
