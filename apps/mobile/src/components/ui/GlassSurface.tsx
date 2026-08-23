import { BlurView } from "expo-blur";
import { glass, glassEdge } from "@collegeos/design/native";
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

export type GlassTier = "base" | "raised" | "sunken";

export interface GlassSurfaceProps {
  tier: GlassTier;
  children: ReactNode;
  /** Radius, borderColor overrides (focus/error rings), etc. -- applied to the outer surface. */
  style?: StyleProp<ViewStyle>;
  /** Applied to the content wrapper, e.g. padding. */
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * DESIGN_LANGUAGE_V2 2.2 -- blur and tint paint into a decoration layer; content is a separate
 * sibling on top of it, so no caller needs its own position/zIndex patch.
 *
 * ---------------------------------------------------------------------------------------------
 * WHY THE CLIPPING LIVES ON AN INNER LAYER AND NOT ON THE ROOT -- do not "simplify" this back.
 *
 * The root used to carry `overflow: "hidden"` so the blur/tint clipped to the rounded corners. On
 * iOS that maps to `clipsToBounds = YES`, and it SILENTLY BROKE TOUCH DELIVERY TO EVERY CHILD: a
 * TextInput inside a GlassSurface could not be focused at all. Tapping a text field did nothing,
 * which made signing in on a real device impossible.
 *
 * It was invisible to every check we had:
 *   - Expo Web (the entire mobile verification path) resolves pointer events through CSS, where
 *     `overflow: hidden` does not affect hit-testing. Every screen "passed".
 *   - The accessibility tree still reported the TextField at that exact point, so
 *     `idb ui describe-point` looked correct while every real tap was swallowed.
 *   - Typecheck, lint and jest are all blind to it.
 *
 * Confirmed by bisection on a real simulator: with the root clipped, AXValue stayed "" after
 * tapping and typing; with clipping moved off the root, the identical taps produced "zzz".
 *
 * So the root is unclipped and owns borders and touches; a pointerEvents="none" decoration layer
 * carries the clipping and the radius. `pointerEvents="none"` alone was NOT sufficient -- the
 * clipping was the cause -- but both are kept, because a decorative layer should never take a
 * touch regardless.
 * ---------------------------------------------------------------------------------------------
 *
 * Android renders `tier`'s fill as a solid fill here, never a blur, unless `blurTarget` is wired
 * -- see FOLLOWUPS G1. Readable either way; the tint alone is the mandatory fallback.
 *
 * ---------------------------------------------------------------------------------------------
 * THE CONTENT WRAPPER DELIBERATELY HAS NO DEFAULT `flexGrow` -- tried it, reverted it, don't
 * retry it here.
 *
 * A caller whose root `style` gives GlassSurface a fixed size (Input/Textarea/Select/DatePicker/
 * TimePicker's `height: 44`) needs its content to fill that box, or a `flex: 1` child of the
 * content wrapper (Select/DatePicker/TimePicker's trigger Pressable) has no real space to grow
 * into and collapses toward zero -- confirmed live on device: `describe-point` across the whole
 * visible trigger box for `Select`/`DatePicker` found nothing, and their placeholder text never
 * painted either (a zero-sized view doesn't lay out its `Text` children).
 *
 * The obvious fix is a default `flexGrow: 1` on the content wrapper. That regressed `NavLink`
 * live: `NavLink` is the one consumer that both passes its own `contentStyle`
 * (`{ alignSelf: 'flex-start' }`, so it sizes to its label instead of stretching) AND sits in an
 * auto-height root -- combining a default `flexGrow: 1` with that `alignSelf` produced a ~784pt
 * void above the course-detail screen's title in the real device sweep. Six of the ten consumers
 * have an auto-height root; a single shared default can't safely serve both that group and the
 * five fixed-height ones without knowing which case it's in. So the fix lives on the three
 * fixed-height callers that actually need it (`Select`/`DatePicker`/`TimePicker`'s own
 * `contentStyle={{ flexGrow: 1 }}`), not here. Three local patches, chosen deliberately over a
 * shared one that reshaped a component that never asked for it -- see FOLLOWUPS for the fuller
 * record.
 * ---------------------------------------------------------------------------------------------
 */
export function GlassSurface({ tier, children, style, contentStyle }: GlassSurfaceProps) {
  // The decoration layer must clip to the same corner radius the caller asked for. Read it off the
  // caller's style rather than taking a second prop that could drift out of sync with it.
  const flattened = StyleSheet.flatten(style) ?? {};
  const cornerRadius: ViewStyle = {
    borderRadius: flattened.borderRadius,
    borderTopLeftRadius: flattened.borderTopLeftRadius,
    borderTopRightRadius: flattened.borderTopRightRadius,
    borderBottomLeftRadius: flattened.borderBottomLeftRadius,
    borderBottomRightRadius: flattened.borderBottomRightRadius,
  };

  return (
    <View style={[glassEdge, style]}>
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.decoration, cornerRadius]}>
        <BlurView intensity={TIER_INTENSITY[tier]} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: TIER_FILL[tier] }]} />
      </View>
      <View style={contentStyle}>{children}</View>
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
  /** Clipping lives here, on a layer that takes no touches -- never on the root. See above. */
  decoration: {
    overflow: "hidden",
  },
});
