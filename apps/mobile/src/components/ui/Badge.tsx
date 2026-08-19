import { color, radius, space } from "@collegeos/design/native";
import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { textStyle } from "../../design/typography";

export type BadgeTone = "neutral" | "accent";

export interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
}

const TONE_BG: Record<BadgeTone, string> = {
  neutral: color.surfaceSunken,
  accent: color.accentWash,
};

const TONE_FG: Record<BadgeTone, string> = {
  neutral: color.inkMuted,
  accent: color.accent,
};

/** For non-risk labels (counts, status words). Use RiskPill for the four risk bands. */
export function Badge({ tone = "neutral", children }: BadgeProps) {
  return (
    <View style={[styles.pill, { backgroundColor: TONE_BG[tone] }]}>
      <Text style={textStyle("label", TONE_FG[tone])}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
});
