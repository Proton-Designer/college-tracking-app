import { color, space } from "@collegeos/design/native";
import { StyleSheet, Text, View } from "react-native";
import type { HabitBounceBack } from "../../lib/useInsightsData";
import { textStyle } from "../../design/typography";

const TREND_GLYPH: Record<string, string> = { improving: "↓", worsening: "↑", stable: "→", insufficient: "" };

/** Ported from web's BounceBackSection. Lower recovery time is the improvement, hence
 *  the trend glyph reads inverted from a naive "up is good". */
export function BounceBackSection({ items }: { items: HabitBounceBack[] }) {
  if (items.length === 0) {
    return <Text style={textStyle("bodyS", color.inkMuted)}>No active kill-list commitments yet.</Text>;
  }

  return (
    <View style={styles.list}>
      {items.map(({ habit, result }, i) => (
        <View key={habit.id} style={[styles.row, i === items.length - 1 ? styles.rowLast : styles.rowBorder]}>
          <Text style={textStyle("body", color.ink)}>{habit.name}</Text>
          <View style={styles.scoreCol}>
            <Text style={textStyle("metric", color.ink)}>{result.confidence === "insufficient" ? "—" : result.score}</Text>
            <Text style={textStyle("caption", color.inkFaint)}>
              {result.confidence === "insufficient" ? "not enough recovered lapses yet" : `${result.trend} ${TREND_GLYPH[result.trend]}`.trim()}
              {result.ongoingLapseDays > 0 ? ` · ${result.ongoingLapseDays}d ongoing` : ""}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 0,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space[3],
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  scoreCol: {
    alignItems: "flex-end",
    gap: 2,
  },
});
