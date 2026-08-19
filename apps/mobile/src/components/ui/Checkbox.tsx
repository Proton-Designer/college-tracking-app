import { color, radius, space } from "@collegeos/design/native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";
import { FieldError } from "./FieldError";

export interface CheckboxProps {
  checked: boolean;
  onValueChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  error?: string;
}

export function Checkbox({ checked, onValueChange, label, disabled = false, error }: CheckboxProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked, disabled }}
        disabled={disabled}
        onPress={() => onValueChange(!checked)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.row}
      >
        <View
          style={[
            styles.box,
            {
              borderColor: error && !checked ? color.riskCritical : checked ? color.accent : color.border,
              backgroundColor: checked ? color.accent : color.surfaceSunken,
              opacity: disabled ? 0.5 : 1,
            },
            focused ? styles.focusRing : null,
          ]}
        >
          {checked ? <Text style={styles.check}>✓</Text> : null}
        </View>
        <Text style={textStyle("body", disabled ? color.inkFaint : color.ink)}>{label}</Text>
      </Pressable>
      {error ? <FieldError>{error}</FieldError> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: space[1],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    minHeight: 44,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  check: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
    outlineStyle: "solid",
  },
});
