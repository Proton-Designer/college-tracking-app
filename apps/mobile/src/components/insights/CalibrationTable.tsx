import type { CalibrationTableRow } from "@collegeos/api";
import { color, space } from "@collegeos/design/native";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";

function categoryLabel(category: string): string {
  return category.replace(/_/g, " ");
}

function sourceLabel(source: CalibrationTableRow["result"]["source"]): string {
  if (source === "category") return "this category";
  if (source === "global") return "your overall average";
  return "none — default 1.0×";
}

/** Ported from web's CalibrationTable as a card list (mobile has no HTML table idiom). */
export function CalibrationTable({ rows }: { rows: CalibrationTableRow[] }) {
  if (rows.length === 0) {
    return <Text style={textStyle("bodyS", color.inkFaint)}>No completed sessions yet to calibrate against.</Text>;
  }

  return (
    <View style={styles.list}>
      {rows.map(({ category, result }, i) => (
        <View key={category} style={[styles.row, i === rows.length - 1 ? styles.rowLast : styles.rowBorder]}>
          <View style={styles.rowTop}>
            <Text style={textStyle("bodyS", color.ink)}>{categoryLabel(category)}</Text>
            <Text style={textStyle("bodyS", color.ink)}>×{result.multiplier.toFixed(2)}</Text>
          </View>
          <Text style={textStyle("caption", color.inkFaint)}>
            {result.confidence} · n={Math.round(result.effectiveSampleSize)} · {sourceLabel(result.source)}
          </Text>
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
    gap: 2,
    paddingBottom: space[3],
    marginBottom: space[3],
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
    justifyContent: "space-between",
  },
});
