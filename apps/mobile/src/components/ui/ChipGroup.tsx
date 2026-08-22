import { color, radius, space } from "@collegeos/design/native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
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
      <View accessibilityRole="radiogroup" style={styles.row}>
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
        {
          borderColor: selected ? color.accent : color.border,
          backgroundColor: selected ? color.accent : color.surface,
          opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
        },
        focused && !disabled ? styles.focusRing : null,
      ]}
    >
      <Text style={textStyle("bodyS", selected ? "#FFFFFF" : color.ink)}>{option.label}</Text>
    </Pressable>
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
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space[5],
    paddingVertical: space[2],
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
    outlineStyle: "solid",
  },
});
