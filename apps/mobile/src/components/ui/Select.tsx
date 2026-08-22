import { color, radius, space } from "@collegeos/design/native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { FieldError } from "./FieldError";
import { Label } from "./Label";
import { Modal } from "./Modal";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label?: string;
  options: SelectOption[];
  value: string | null;
  onValueChange: (value: string) => void;
  /** Shown while value is null. Never a default selection -- unset stays unset. */
  placeholder?: string;
  disabled?: boolean;
  error?: string | undefined;
  required?: boolean;
}

/** A trigger that opens a picker sheet (built on the shared Modal) -- there's no native
 *  <select> equivalent on RN, and this keeps the same list-of-options mental model as
 *  ChipGroup/SegmentedControl rather than a platform-specific wheel. */
export function Select({
  label,
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  disabled = false,
  error,
  required,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View style={styles.container}>
      {label ? <Label required={required}>{label}</Label> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: open }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => [
          styles.trigger,
          {
            borderColor: error ? color.riskCritical : color.border,
            opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
          },
          focused && !disabled ? styles.focusRing : null,
        ]}
      >
        <Text style={textStyle("body", selected ? color.ink : color.inkFaint)} numberOfLines={1}>
          {selected ? selected.label : placeholder}
        </Text>
        <Text style={textStyle("bodyS", color.inkFaint)}>▾</Text>
      </Pressable>
      {error ? <FieldError>{error}</FieldError> : null}

      <Modal visible={open} onClose={() => setOpen(false)} title={label ?? "Select"}>
        <View style={styles.list}>
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  onValueChange(option.value);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.option, { backgroundColor: pressed ? color.surfaceSunken : "transparent" }]}
              >
                <Text style={textStyle("body", isSelected ? color.accent : color.ink)}>{option.label}</Text>
                {isSelected ? <Text style={textStyle("body", color.accent)}>✓</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space[2],
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 44,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space[3],
    backgroundColor: color.surfaceSunken,
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
    outlineStyle: "solid",
  },
  list: {
    gap: space[1],
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    paddingHorizontal: space[3],
    borderRadius: radius.sm,
  },
});
