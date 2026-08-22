import { BlurView } from "expo-blur";
import { color, glass, glassEdge, radius, shadow, space } from "@collegeos/design/native";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { textStyle } from "../../design/typography";

export type PanelTone = "surface" | "sunken";

export interface PanelProps {
  title?: string;
  tone?: PanelTone;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Turns the whole panel into a real control with press/focus feedback, for the rare case
   *  a panel IS the tappable unit rather than a static readout housing other controls. */
  onPress?: () => void;
  /** RN aggregates child Text into an accessible name well enough for simple cases, but a
   *  pressable Panel's children can be arbitrary rich content -- pass this explicitly rather
   *  than rely on that when the default `title` fallback below isn't right either. */
  accessibilityLabel?: string;
  testID?: string;
}

/** §2/§4 -- `surface` is `glass.base`, `sunken` is the tier a level deeper (`glass.sunken`).
 *  Intensity is native's hand-calibrated stand-in for a literal CSS blur radius -- see
 *  `design.tsx`'s GLASS_TIER_INTENSITY comment for why there's no exact unit conversion. */
const TONE_FILL: Record<PanelTone, string> = {
  surface: glass.base.fill,
  sunken: glass.sunken.fill,
};
const TONE_BLUR_INTENSITY: Record<PanelTone, number> = {
  surface: 60,
  sunken: 35,
};

/** A glass readout panel. §4 reverses v1's "cards get no shadow, ever" -- `shadow.glass` is
 *  what keeps this from reading as a flat translucent rectangle, and `glassEdge`'s two edges
 *  (top highlight + hairline) are what separate it from a plain tinted box.
 *  Android renders `TONE_FILL` as a solid fill here, never a blur, unless `blurTarget` is
 *  wired -- see FOLLOWUPS G1. Readable either way; the tint alone is the mandatory fallback. */
export function Panel({ title, tone = "surface", children, style, onPress, accessibilityLabel, testID }: PanelProps) {
  const [focused, setFocused] = useState(false);

  const body = (
    <View style={styles.body}>
      {title ? <Text style={[textStyle("title", color.ink), styles.title]}>{title}</Text> : null}
      {children}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        onPress={onPress}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.shadowWrap, focused ? styles.focusRing : null, style]}
      >
        {({ pressed }) => (
          <View style={[styles.clip, glassEdge]}>
            <BlurView intensity={TONE_BLUR_INTENSITY[tone]} tint="light" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: TONE_FILL[tone] }]} />
            {pressed ? <View style={[StyleSheet.absoluteFill, styles.pressedOverlay]} /> : null}
            {body}
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <View testID={testID} style={[styles.shadowWrap, style]}>
      <View style={[styles.clip, glassEdge]}>
        <BlurView intensity={TONE_BLUR_INTENSITY[tone]} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: TONE_FILL[tone] }]} />
        {body}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrap: {
    borderRadius: radius.lg,
    ...shadow.glass,
  },
  clip: {
    borderRadius: radius.lg,
    overflow: "hidden",
  },
  body: {
    padding: space[5],
  },
  title: {
    marginBottom: space[3],
  },
  pressedOverlay: {
    backgroundColor: "rgba(14,18,32,0.05)",
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
    outlineStyle: "solid",
  },
});
