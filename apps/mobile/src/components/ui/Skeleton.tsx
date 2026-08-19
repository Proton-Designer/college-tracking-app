import { color, radius } from "@collegeos/design/native";
import { useEffect, useState } from "react";
import { Animated, StyleSheet, type DimensionValue } from "react-native";

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  radius?: "sm" | "md" | "lg" | "pill";
}

const RADIUS_MAP = {
  sm: radius.sm,
  md: radius.md,
  lg: radius.lg,
  pill: radius.pill,
} as const;

/** Mirrors the real layout's geometry — never a generic shimmer box unrelated to what's loading. */
export function Skeleton({ width = "100%", height = 16, radius: radiusKey = "sm" }: SkeletonProps) {
  const [opacity] = useState(() => new Animated.Value(0.5));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      style={[
        styles.base,
        { width, height, borderRadius: RADIUS_MAP[radiusKey], opacity },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: color.surfaceSunken,
  },
});
