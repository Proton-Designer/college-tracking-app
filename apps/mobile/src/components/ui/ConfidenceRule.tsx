import { StyleSheet, View } from "react-native";

export type ConfidenceLineStyle = "solid" | "dashed" | "dotted";

// RN's `borderStyle: 'dashed'/'dotted'` frequently renders as solid on iOS — composing the
// rule from small Views instead of trusting the native border renderer, so dashed/dotted/solid
// stay genuinely three distinct states for the ratified confidence-as-line-style convention
// (DESIGN_SYSTEM §6.2). The segments are absolutely positioned inside the track so they never
// contribute to its own layout size -- the track's height comes purely from `alignSelf:
// "stretch"` matching its sibling content. Ported from MitList.tsx, the pattern's original
// home; extracted here once a second consumer (Insights) needed the identical rule.
const RULE_SEGMENTS = 20;
const RULE_GAP = 3;

export function ConfidenceRule({ lineStyle, ruleColor }: { lineStyle: ConfidenceLineStyle; ruleColor: string }) {
  if (lineStyle === "solid") {
    return <View style={[styles.track, { backgroundColor: ruleColor }]} />;
  }
  const segLen = lineStyle === "dotted" ? 2 : 5;
  return (
    <View style={styles.track}>
      {Array.from({ length: RULE_SEGMENTS }, (_, i) => i).map((i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            top: i * (segLen + RULE_GAP),
            width: 2,
            height: segLen,
            backgroundColor: ruleColor,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: 2,
    alignSelf: "stretch",
    overflow: "hidden",
  },
});
