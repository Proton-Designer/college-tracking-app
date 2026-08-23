import type { CauseTrendEntry, FrictionDistribution } from "@collegeos/core";
import { color, space } from "@collegeos/design/native";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";

function causeLabel(cause: string): string {
  return cause.replace(/_/g, " ");
}

const TREND_GLYPH: Record<CauseTrendEntry["direction"], string> = { up: "↑", down: "↓", stable: "→" };

/** Ported from web's FrictionDistributionSection. */
export function FrictionDistributionSection({ distribution, trend }: { distribution: FrictionDistribution; trend: CauseTrendEntry[] }) {
  if (distribution.totalCount === 0) {
    return <Text style={textStyle("bodyS", color.inkMuted)}>No friction logged in the last 30 days.</Text>;
  }

  const trendByCause = new Map(trend.map((t) => [t.cause, t]));

  return (
    <View style={styles.list}>
      {distribution.entries.map((entry, i) => {
        const t = trendByCause.get(entry.cause);
        return (
          <View key={entry.cause} style={[styles.row, i === distribution.entries.length - 1 ? styles.rowLast : styles.rowBorder]}>
            <Text style={textStyle("bodyS", color.ink)}>{causeLabel(entry.cause)}</Text>
            <Text style={textStyle("bodyS", color.inkMuted)}>
              {entry.count} · {Math.round(entry.percentage)}%
              {t && t.direction !== "stable" ? ` ${TREND_GLYPH[t.direction]} ${Math.abs(t.deltaPercentagePoints).toFixed(1)}pp` : ""}
            </Text>
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space[2],
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
});
