import { color, radius, space } from "@collegeos/design/native";
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

const TONE_BG: Record<PanelTone, string> = {
  surface: color.surface,
  sunken: color.surfaceSunken,
};

/** A readout panel sitting on the ground. No shadow — ever. Hairline + surface (or the
 *  `sunken` tone, for a readout nested a level deeper than its parent) do the work. */
export function Panel({ title, tone = "surface", children, style, onPress, accessibilityLabel, testID }: PanelProps) {
  const [focused, setFocused] = useState(false);

  const content = (
    <>
      {title ? <Text style={[textStyle("title", color.ink), styles.title]}>{title}</Text> : null}
      {children}
    </>
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
        style={({ pressed }) => [
          styles.panel,
          { backgroundColor: pressed ? color.surfaceSunken : TONE_BG[tone] },
          focused ? styles.focusRing : null,
          style,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View testID={testID} style={[styles.panel, { backgroundColor: TONE_BG[tone] }, style]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.hairline,
    padding: space[5],
  },
  title: {
    marginBottom: space[3],
  },
  focusRing: {
    outlineWidth: 2,
    outlineColor: color.accent,
    outlineOffset: 2,
    outlineStyle: "solid",
  },
});
