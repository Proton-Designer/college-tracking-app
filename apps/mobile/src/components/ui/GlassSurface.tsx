import { BlurView } from "expo-blur";
import { glass, glassEdge } from "@collegeos/design/native";
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

export type GlassTier = "base" | "raised" | "sunken";

export interface GlassSurfaceProps {
  tier: GlassTier;
  children: ReactNode;
  /** Radius, borderColor overrides (focus/error rings), etc. -- applied to the clipped surface. */
  style?: StyleProp<ViewStyle>;
  /** Applied to the content wrapper, e.g. padding. Content itself never needs its own
   *  position/zIndex -- that's this component's job, not each caller's. */
  contentStyle?: StyleProp<ViewStyle>;
}

/** DESIGN_LANGUAGE_V2 §2.2 -- the structural fix for the stacking bug found independently on
 *  both platforms (web: backdrop-filter's own stacking context ate a modal's clicks; native:
 *  RN-web's <input> painted behind a sibling BlurView and had its own text blurred). The blur
 *  and tint paint into THIS wrapper; content is a genuinely separate layer on top of it, not a
 *  sibling that has to out-rank two absolutely-positioned views on its own. No caller of this
 *  component needs its own position/zIndex patch again.
 *
 *  Android renders `tier`'s fill as a solid fill here, never a blur, unless `blurTarget` is
 *  wired -- see FOLLOWUPS G1. Readable either way; the tint alone is the mandatory fallback. */
export function GlassSurface({ tier, children, style, contentStyle }: GlassSurfaceProps) {
  return (
    <View style={[styles.clip, glassEdge, style]}>
      <BlurView intensity={TIER_INTENSITY[tier]} tint="light" style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: TIER_FILL[tier] }]} />
      <View style={[styles.content, contentStyle]}>{children}</View>
    </View>
  );
}

const TIER_FILL: Record<GlassTier, string> = {
  base: glass.base.fill,
  raised: glass.raised.fill,
  sunken: glass.sunken.fill,
};

/** Native has no literal CSS blur-radius; hand-calibrated to read at each tier's relative
 *  strength (24 / 32 / 16 web px), not a unit conversion. */
const TIER_INTENSITY: Record<GlassTier, number> = {
  base: 60,
  raised: 80,
  sunken: 35,
};

const styles = StyleSheet.create({
  clip: {
    overflow: "hidden",
  },
  content: {
    position: "relative",
    zIndex: 1,
  },
});
