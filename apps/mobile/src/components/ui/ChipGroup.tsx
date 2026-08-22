import { color, radius, space } from "@collegeos/design/native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { GlassSurface } from "./GlassSurface";
import { Label } from "./Label";

export interface ChipOption {
  value: string;
  label: string;
}

export interface ChipGroupProps {
  label: string;
  options: ChipOption[];
  value: string | null;
  onValueChange: (value: string) => void;
  disabled?: boolean;
}

/** Single-select pill row — the morning check-in's derailment prediction and Night
 *  Review's failure-reason log share this exact pattern. Ported from web's ChipGroup. */
export function ChipGroup({ label, options, value, onValueChange, disabled = false }: ChipGroupProps) {
  return (
    <View style={styles.container}>
      <Label>{label}</Label>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.row}>
        {options.map((option) => (
          <Chip
            key={option.value}
            option={option}
            selected={value === option.value}
            disabled={disabled}
            onPress={() => onValueChange(option.value)}
          />
        ))}
      </View>
    </View>
  );
}

/** Same split as Button: a selected chip is a decision (solid accent), an unselected chip is
 *  `glass-base` -- a chip resting on the ground, the tier table's own words for this tier. */
function Chip({
  option,
  selected,
  disabled,
  onPress,
}: {
  option: ChipOption;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const [focused, setFocused] = useState(false);

  if (selected) {
    return (
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => [
          styles.chip,
          styles.chipSelected,
          { opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
          focused && !disabled ? styles.focusRing : null,
        ]}
      >
        <Text style={textStyle("bodyS", "#FFFFFF")}>{option.label}</Text>
      </Pressable>
    );
  }

  return (
    <GlassSurface
      tier="base"
      style={[styles.chip, { opacity: disabled ? 0.4 : 1 }, focused && !disabled ? styles.focusRing : null]}
    >
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => [styles.chipInner, { opacity: pressed ? 0.85 : 1 }]}
      >
        <Text style={textStyle("bodyS", color.ink)}>{option.label}</Text>
      </Pressable>
    </GlassSurface>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space[2],
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
  },
  chip: {
    minHeight: 44,
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  chipInner: {
    justifyContent: "center",
    paddingHorizontal: space[5],
    paddingVertical: space[2],
  },
  chipSelected: {
    backgroundColor: color.accent,
    paddingHorizontal: space[5],
    paddingVertical: space[2],
    alignItems: "center",
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
    outlineStyle: "solid",
  },
});
