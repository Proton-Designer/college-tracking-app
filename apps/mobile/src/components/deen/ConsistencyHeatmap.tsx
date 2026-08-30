import { PRAYER_LABELS, type ConsistencyGrid, type EffectivePrayerStatus } from "@collegeos/core";
import { color, domainColor, space } from "@collegeos/design/native";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { formatShortDate } from "../../lib/dates";
import { tintWithAlpha } from "../../lib/colorAlpha";

/**
 * The 30-day x 5 consistency grid — mirrors apps/web/src/components/deen/ConsistencyHeatmap.tsx
 * exactly (same states, same words, same colours, same reasoning). One of the four surfaces
 * D30 kept when it dropped the prayer streak.
 *
 * **Colour never carries the meaning on its own.** Every cell is its own accessibility element
 * with a label naming the prayer, the date and the status in words, and the legend below names
 * all five states. Colour is a second encoding of something already stated.
 *
 * **Missed is grey, not red.** A miss is stated plainly and paired with the way back (the qada
 * list above it); the heatmap is not the place to shout at someone about it.
 */

const CELL_SIZE = 7;
const CELL_GAP = 2;
const LABEL_WIDTH = 40;

const CELL_STYLE: Record<EffectivePrayerStatus, { backgroundColor: string; borderColor?: string }> = {
  on_time: { backgroundColor: domainColor.deen },
  // The same hue at partial strength: made up is the same prayer, later.
  qada: { backgroundColor: tintWithAlpha(domainColor.deen, 0.45) },
  missed: { backgroundColor: color.inkFaint },
  pending: { backgroundColor: color.surfaceSunken },
  upcoming: { backgroundColor: "transparent", borderColor: color.hairline },
};

const STATUS_WORDS: Record<EffectivePrayerStatus, string> = {
  on_time: "On time",
  qada: "Made up",
  missed: "Missed",
  pending: "Not recorded",
  upcoming: "Still to come",
};

/** `pending` reads differently depending on WHY nothing resolved: with no location we cannot
 *  know, rather than the window merely being open. D40 — the label has to say which. */
function statusWord(status: EffectivePrayerStatus, hasLocation: boolean): string {
  if (status === "pending" && !hasLocation) return "Awaiting a time";
  return STATUS_WORDS[status];
}

const LEGEND_ORDER: EffectivePrayerStatus[] = ["on_time", "qada", "missed", "pending", "upcoming"];

export function ConsistencyHeatmap({ grid, hasLocation }: { grid: ConsistencyGrid; hasLocation: boolean }) {
  const firstDate = grid.dates[0];
  const lastDate = grid.dates.at(-1);

  return (
    <View style={styles.container}>
      {/* Horizontal scroll rather than a squeezed cell size: 30 columns at a legible size is
          wider than a small phone, and shrinking the cells to fit is how a heatmap becomes a
          smudge. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {grid.rows.map((row) => (
            <View key={row.prayer} style={styles.row}>
              <Text style={[textStyle("caption", color.inkMuted), styles.rowLabel]}>
                {PRAYER_LABELS[row.prayer]}
              </Text>
              {row.cells.map((cell, index) => {
                const date = grid.dates[index] ?? "";
                return (
                  <View
                    key={date}
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={`${PRAYER_LABELS[row.prayer]}, ${formatShortDate(date)}, ${statusWord(cell, hasLocation)}`}
                    style={[styles.cell, CELL_STYLE[cell], CELL_STYLE[cell].borderColor ? styles.cellOutlined : null]}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>

      {firstDate && lastDate ? (
        <View style={styles.axis}>
          <Text style={textStyle("caption", color.inkFaint)}>{formatShortDate(firstDate)}</Text>
          <Text style={textStyle("caption", color.inkFaint)}>{formatShortDate(lastDate)}</Text>
        </View>
      ) : null}

      <View style={styles.legend}>
        {LEGEND_ORDER.map((status) => (
          <View key={status} style={styles.legendItem}>
            <View
              style={[
                styles.legendSwatch,
                CELL_STYLE[status],
                CELL_STYLE[status].borderColor ? styles.cellOutlined : null,
              ]}
            />
            <Text style={textStyle("caption", color.inkMuted)}>{statusWord(status, hasLocation)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space[3] },
  row: { flexDirection: "row", alignItems: "center", marginBottom: CELL_GAP },
  rowLabel: { width: LABEL_WIDTH },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE * 2,
    borderRadius: 2,
    marginRight: CELL_GAP,
  },
  cellOutlined: { borderWidth: 1 },
  axis: { flexDirection: "row", justifyContent: "space-between" },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: space[3] },
  legendItem: { flexDirection: "row", alignItems: "center", gap: space[2] },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
});
