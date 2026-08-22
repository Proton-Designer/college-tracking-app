import { color, radius, shadow, space } from "@collegeos/design/native";
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { tintWithAlpha } from "../../lib/colorAlpha";
import { GlassSurface, type GlassTier } from "./GlassSurface";

export interface WarningCardProps {
  children: ReactNode;
  /** Defaults to riskHigh -- the only tone every call site has needed so far. Exposed rather
   *  than hardcoded since the shape (glass-base + low-alpha tint) is tone-agnostic. */
  tone?: string;
  /** Defaults to "base". A free-standing warning (RecoveryBanner, the course-detail weight-sum
   *  warning, GenerateBackplanSection's conflict confirmation) sits directly on the aurora/ground
   *  and reads correctly as base. A warning nested INSIDE another glass surface needs "sunken" --
   *  two base tiers sharing the same edge shadow against the live aurora go muddy and the
   *  boundary between them vanishes (found on web when ATLAS nested one inside a panel). */
  tier?: Extract<GlassTier, "base" | "sunken">;
  /** Overrides the default padding/gap -- a call site with its own established internal
   *  rhythm (RecoveryBanner) merges its own spacing on top rather than adopting this
   *  component's default. */
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * A real alert, expressed in v2's glass vocabulary rather than a flat colored box: `glass-base`
 * + `shadow.glass` + `glassEdge`'s own neutral border (never overridden -- RecoveryBanner and
 * course detail's weight-sum warning both got this wrong on the first pass, landing on a hard
 * solid-color border that read as v1 next to real glass). The alert identity is carried only by
 * a low-alpha tint on the content, painted as an ordinary background (not an absolutely-
 * positioned overlay) so it never needs its own position/zIndex bookkeeping -- see FOLLOWUPS/§2.2.
 *
 * Third call site (this one, after RecoveryBanner and the course-detail warning) is what made
 * this worth extracting instead of a third hand-rolled copy.
 */
export function WarningCard({ children, tone = color.riskHigh, tier = "base", contentStyle }: WarningCardProps) {
  return (
    <View style={styles.shadowWrap}>
      <GlassSurface
        tier={tier}
        style={styles.clip}
        contentStyle={[styles.content, { backgroundColor: tintWithAlpha(tone, 0.07) }, contentStyle]}
      >
        {children}
      </GlassSurface>
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
  },
  content: {
    padding: space[4],
    gap: space[2],
  },
});
