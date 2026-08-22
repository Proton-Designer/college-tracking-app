import { color, space } from "@collegeos/design/native";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";

/** A static "instrument reading" of one real day -- the hero's signature visual, ported
 *  from web's marketing/DayReading.tsx (same synthetic Tuesday, same numbers). This shares
 *  the planned-ghost / actual-solid motif with the real Day Trace (Today's screen), but is
 *  a deliberately simpler, non-live illustration for the welcome screen. Built from plain
 *  Views (react-native-svg isn't a dependency) with sharp corners rather than the real Day
 *  Trace's rounded ones -- RN's dashed border renders solid on iOS once borderRadius > 0,
 *  and a static marketing illustration has no reason to fight that bug when radius 0 sidesteps
 *  it entirely. */

const DAY_START_MIN = 8 * 60;
const DAY_END_MIN = 21 * 60;
const RANGE = DAY_END_MIN - DAY_START_MIN;

function pct(hh: number, mm: number): number {
  return ((hh * 60 + mm - DAY_START_MIN) / RANGE) * 100;
}

interface Block {
  label: string;
  start: [number, number];
  end: [number, number];
}

const PLANNED: Block[] = [
  { label: "BIOL 23000", start: [9, 30], end: [10, 45] },
  { label: "PHYS 241 lab", start: [13, 0], end: [14, 50] },
  { label: "BME 301 study", start: [16, 30], end: [18, 0] },
];

const ACTUAL: Block[] = [
  { label: "BIOL 23000", start: [9, 30], end: [10, 45] },
  { label: "PHYS 241 lab", start: [13, 0], end: [14, 50] },
  { label: "BME 301 study", start: [17, 7], end: [18, 40] },
];

/** The commitment that never happened -- the chart's most important mark. */
const MISSED: Block = { label: "Gym — didn't happen", start: [18, 30], end: [19, 30] };

const ROW_H = 22;

function blockStyle(b: Block): { left: `${number}%`; width: `${number}%` } {
  return { left: `${pct(...b.start)}%`, width: `${pct(...b.end) - pct(...b.start)}%` };
}

export function DayReading() {
  return (
    <View accessible accessibilityLabel="A chart comparing one Tuesday's planned schedule against what actually happened: class and lab matched the plan, but the evening study block started 37 minutes late and finished 40 minutes later than planned, and the planned gym session never happened.">
      <View style={styles.caption}>
        <Text style={textStyle("caption", color.inkFaint)}>TUESDAY · PLANNED VS. ACTUAL</Text>
        <Text style={textStyle("caption", color.inkFaint)}>8 AM–9 PM</Text>
      </View>

      <View style={styles.chartRow}>
        <View style={styles.labelColumn}>
          <Text style={[textStyle("caption", color.inkFaint), styles.rowLabelText]}>PLAN</Text>
          <View style={{ height: space[2] }} />
          <Text style={[textStyle("caption", color.ink), styles.rowLabelText]}>ACT</Text>
        </View>

        <View style={styles.timeline}>
          <View style={[styles.track, { top: 0 }]}>
            {PLANNED.map((b) => (
              <View key={b.label} style={[styles.plannedBlock, blockStyle(b)]} />
            ))}
            <View style={[styles.plannedBlock, styles.missedBlock, blockStyle(MISSED)]} />
            <View style={[styles.missedLine, blockStyle(MISSED)]} />
          </View>
          <View style={{ height: space[2] }} />
          <View style={[styles.track, { top: 0 }]}>
            {ACTUAL.map((b) => (
              <View key={b.label} style={[styles.actualBlock, blockStyle(b)]} />
            ))}
          </View>
        </View>
      </View>

      <Text style={[textStyle("caption", color.riskHigh), styles.missedCaption]}>Gym — didn&apos;t happen</Text>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={textStyle("label", color.inkMuted)}>Study block started</Text>
          <Text style={textStyle("metric", color.ink)}>
            +37<Text style={textStyle("caption", color.inkMuted)}> min late</Text>
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={textStyle("label", color.inkMuted)}>Finished</Text>
          <Text style={textStyle("metric", color.ink)}>
            +40<Text style={textStyle("caption", color.inkMuted)}> min later</Text>
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={textStyle("label", color.inkMuted)}>MIT completion</Text>
          <Text style={textStyle("metric", color.ink)}>2 / 3</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: space[2],
  },
  chartRow: {
    flexDirection: "row",
    gap: space[3],
  },
  labelColumn: {
    width: 30,
  },
  rowLabelText: {
    height: ROW_H,
    lineHeight: ROW_H,
  },
  timeline: {
    flex: 1,
  },
  track: {
    height: ROW_H,
    position: "relative",
  },
  plannedBlock: {
    position: "absolute",
    height: ROW_H,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: color.inkFaint,
  },
  missedBlock: {
    borderColor: color.riskHigh,
  },
  missedLine: {
    position: "absolute",
    top: ROW_H / 2,
    height: 1.5,
    backgroundColor: color.riskHigh,
  },
  actualBlock: {
    position: "absolute",
    height: ROW_H,
    backgroundColor: color.accent,
  },
  missedCaption: {
    marginTop: space[2],
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[5],
    marginTop: space[4],
    paddingTop: space[4],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
  stat: {
    gap: 2,
  },
});
