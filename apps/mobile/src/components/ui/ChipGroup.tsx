import { color, radius, space } from "@collegeos/design/native";
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
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onValueChange(option.value)}
              style={({ pressed }) => [
                styles.chip,
                {
                  borderColor: selected ? color.accent : color.border,
                  backgroundColor: selected ? color.accent : color.surface,
                  opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
                },
              ]}
            >
              <Text style={textStyle("bodyS", selected ? "#FFFFFF" : color.ink)}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
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
});
