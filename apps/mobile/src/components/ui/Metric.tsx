import { color, space } from "@collegeos/design/native";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";

export interface MetricDelta {
  /** Pre-formatted, e.g. "1.4 vs 30-day average" — the component never infers a unit. */
  label: string;
  direction: "up" | "down" | "flat";
}

export interface MetricProps {
  label: string;
  value: string | number;
  unit?: string;
  delta?: MetricDelta;
  size?: "default" | "xl";
}

const DELTA_GLYPH: Record<MetricDelta["direction"], string> = {
  up: "↑",
  down: "↓",
  flat: "→",
};

/** A tabular readout number. Numerals are always tabular-nums — never proportional figures. */
export function Metric({ label, value, unit, delta, size = "default" }: MetricProps) {
  return (
    <View style={styles.container}>
      <Text style={textStyle("label", color.inkMuted)}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={textStyle(size === "xl" ? "metricXl" : "metric", color.ink)}>{value}</Text>
        {unit ? <Text style={[textStyle("caption", color.inkMuted), styles.unit]}>{unit}</Text> : null}
      </View>
      {delta ? (
        <Text style={textStyle("caption", color.inkMuted)}>
          {DELTA_GLYPH[delta.direction]} {delta.label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space[1],
  },
  valueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 3,
  },
  unit: {
    marginBottom: 2,
  },
});
