import { color, radius, space } from "@collegeos/design/native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { Label } from "./Label";

export interface SegmentedControlProps {
  label: string;
  value: number | null;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}

/**
 * A row of discrete cells — not a slider. Used for the 1–10 energy/mood scales (§7): discrete
 * values deserve a discrete control, and it makes the tap target honest.
 */
export function SegmentedControl({
  label,
  value,
  onValueChange,
  min = 1,
  max = 10,
  disabled = false,
}: SegmentedControlProps) {
  const cells = Array.from({ length: max - min + 1 }, (_, i) => min + i);

  return (
    <View style={styles.container}>
      <Label>{label}</Label>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.row}>
        {cells.map((cell) => (
          <Cell
            key={cell}
            cell={cell}
            selected={value === cell}
            disabled={disabled}
            onPress={() => onValueChange(cell)}
          />
        ))}
      </View>
    </View>
  );
}

function Cell({
  cell,
  selected,
  disabled,
  onPress,
}: {
  cell: number;
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
        styles.cell,
        {
          borderColor: selected ? color.accent : disabled ? color.hairline : color.border,
          backgroundColor: selected ? color.accent : color.surfaceSunken,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
        focused && !disabled ? styles.focusRing : null,
      ]}
    >
      <Text style={textStyle("bodyS", selected ? "#FFFFFF" : disabled ? color.inkFaint : color.ink)}>
        {cell}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space[2],
  },
  row: {
    flexDirection: "row",
    gap: space[1],
  },
  cell: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
    outlineStyle: "solid",
  },
});
