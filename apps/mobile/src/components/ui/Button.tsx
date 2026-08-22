import { color, radius, space, spring } from "@collegeos/design/native";
import { useState, type ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useReducedMotion } from "../../lib/useReducedMotion";
import { textStyle } from "../../design/typography";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

export interface ButtonProps {
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const VARIANT_BG: Record<ButtonVariant, string> = {
  primary: color.accent,
  secondary: color.surface,
  ghost: "transparent",
  destructive: color.riskCritical,
};

const VARIANT_TEXT_COLOR: Record<ButtonVariant, string> = {
  primary: "#FFFFFF",
  secondary: color.ink,
  ghost: color.ink,
  destructive: "#FFFFFF",
};

export function Button({
  variant = "primary",
  loading = false,
  disabled = false,
  onPress,
  children,
  style,
  testID,
}: ButtonProps) {
  const [focused, setFocused] = useState(false);
  const reducedMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  // Same rule as web: `disabled` blocks the press, but only a true (non-loading) disabled state
  // dims — loading keeps the variant's full color plus a spinner, so the user can see which
  // action is in flight rather than reading a greyed-out button as failure.
  const isInactive = disabled || loading;

  // Press feedback is opacity + scale together — a state change acknowledged on two channels,
  // not just a color dip, is what reads as a real control rather than flat/unstyled RN chrome.
  function handlePressIn() {
    // SharedValue.value assignment is Reanimated's intended API, not React state mutation.
    // eslint-disable-next-line react-hooks/immutability
    scale.value = reducedMotion ? 1 : withSpring(0.96, spring.standard);
  }
  function handlePressOut() {
    // eslint-disable-next-line react-hooks/immutability -- see handlePressIn above.
    scale.value = reducedMotion ? 1 : withSpring(1, spring.standard);
  }

  return (
    <Animated.View style={pressStyle}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ disabled: isInactive, busy: loading }}
        disabled={isInactive}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={({ pressed }) => [
          styles.base,
          {
            backgroundColor: VARIANT_BG[variant],
            borderWidth: variant === "secondary" ? StyleSheet.hairlineWidth : 0,
            borderColor: color.border,
            opacity: disabled && !loading ? 0.4 : pressed ? 0.85 : 1,
          },
          focused && !isInactive ? styles.focusRing : null,
          style,
        ]}
      >
        {loading ? <ActivityIndicator size="small" color={VARIANT_TEXT_COLOR[variant]} /> : null}
        <Text style={[textStyle("body", VARIANT_TEXT_COLOR[variant]), styles.label]}>{children}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: space[5],
    borderRadius: radius.md,
  },
  label: {
    fontWeight: "500",
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
    outlineStyle: "solid",
  },
});
