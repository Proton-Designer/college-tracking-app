import { color, space, spring } from "@collegeos/design/native";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useReducedMotion } from "../../lib/useReducedMotion";
import { textStyle } from "../../design/typography";

const THUMB_OFF = 3;
const THUMB_ON = 19;

export interface ToggleProps {
  checked: boolean;
  onValueChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function Toggle({ checked, onValueChange, label, disabled = false }: ToggleProps) {
  const [focused, setFocused] = useState(false);
  const reducedMotion = useReducedMotion();
  const thumbX = useSharedValue(checked ? THUMB_ON : THUMB_OFF);
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: thumbX.value }] }));

  useEffect(() => {
    const target = checked ? THUMB_ON : THUMB_OFF;
    // SharedValue.value assignment is Reanimated's intended API, not React state mutation;
    // the compiler rule can't see that. No eslint-disable is needed on SDK 54:
    // `react-hooks/immutability` ships with eslint-plugin-react-hooks v6, which
    // eslint-config-expo@10 predates, and a disable directive naming an undefined rule is
    // itself an error. Restore it if the SDK moves back to 55+.
    thumbX.value = reducedMotion ? target : withSpring(target, spring.standard);
  }, [checked, reducedMotion, thumbX]);

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
        <Animated.View style={[styles.thumb, thumbStyle]} />
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
