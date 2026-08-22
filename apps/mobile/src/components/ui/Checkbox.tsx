import { color, radius, space, spring } from "@collegeos/design/native";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useReducedMotion } from "../../lib/useReducedMotion";
import { textStyle } from "../../design/typography";
import { FieldError } from "./FieldError";

export interface CheckboxProps {
  checked: boolean;
  onValueChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  error?: string | undefined;
}

export function Checkbox({ checked, onValueChange, label, disabled = false, error }: CheckboxProps) {
  const [focused, setFocused] = useState(false);
  const reducedMotion = useReducedMotion();
  const checkScale = useSharedValue(checked ? 1 : 0);
  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
    opacity: checkScale.value,
  }));

  useEffect(() => {
    const target = checked ? 1 : 0;
    // SharedValue.value assignment is Reanimated's intended API, not React state mutation;
    // the compiler rule can't see that.
    // eslint-disable-next-line react-hooks/immutability
    checkScale.value = reducedMotion ? target : withSpring(target, spring.standard);
  }, [checked, reducedMotion, checkScale]);

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
          <Animated.Text style={[styles.check, checkStyle]}>✓</Animated.Text>
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
