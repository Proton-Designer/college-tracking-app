import { color, space } from "@collegeos/design/native";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";

export interface ToggleProps {
  checked: boolean;
  onValueChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Toggle({ checked, onValueChange, label, disabled = false }: ToggleProps) {
  const [focused, setFocused] = useState(false);

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onValueChange(!checked)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={styles.row}
    >
      <Text style={[textStyle("body", disabled ? color.inkFaint : color.ink), styles.label]}>
        {label}
      </Text>
      <View
        style={[
          styles.track,
          {
            borderColor: checked ? color.accent : color.border,
            backgroundColor: checked ? color.accent : color.surfaceSunken,
            opacity: disabled ? 0.5 : 1,
          },
          focused ? styles.focusRing : null,
        ]}
      >
        <View style={[styles.thumb, { transform: [{ translateX: checked ? 19 : 3 }] }]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
    minHeight: 44,
  },
  label: {
    flexShrink: 1,
  },
  track: {
    width: 40,
    height: 24,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
  },
  thumb: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
    outlineStyle: "solid",
  },
});
