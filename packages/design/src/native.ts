/**
 * RN-shaped design values. Pure TS/objects only — no `react-native` import here, so this file
 * stays testable and importable outside a native runtime. Consumers pass these into RN's
 * `StyleSheet.create` / Reanimated APIs directly.
 *
 * v2 "Aurora" — see docs/DESIGN_LANGUAGE_V2.md.
 */
import {
  aurora,
  auroraForRisk,
  color,
  fontFamily,
  glass,
  island,
  motion,
  radius,
  riskBandColor,
  riskBands,
  space,
  type,
} from "./tokens";
import type { RiskBand } from "./tokens";

export {
  aurora,
  auroraForRisk,
  color,
  fontFamily,
  glass,
  island,
  radius,
  riskBandColor,
  riskBands,
  space,
  type,
};
export type { RiskBand };

/**
 * RN has no native hairline color; consumers pair this width with `color.hairline` or
 * `color.border` depending on whether the line is decorative or interactive.
 * Use the real `StyleSheet.hairlineWidth` at the call site — it's a native constant this package
 * can't compute without importing react-native, and it varies by device pixel density.
 */
export const hairlineWidthGuidance =
  "Use React Native's StyleSheet.hairlineWidth for the actual width, not a fixed 1." as const;

interface RNShadow {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  /** Android has no shadow* props — this is the elevation approximation. */
  elevation: number;
}

/**
 * DESIGN_LANGUAGE_V2 §4. v1's rule that "cards get no shadow" is REVERSED — glass without
 * elevation reads as a flat translucent box, and `glass` is what makes a panel float.
 *
 * RN can't stack two shadows on one view, so each of these approximates the larger, more visible
 * layer of its web counterpart. `overlay`/`popover` are retained as v1 aliases so existing
 * consumers keep compiling; new work uses `glass`/`lifted`/`islandDock`.
 */
export const shadow: Record<"glass" | "lifted" | "islandDock" | "overlay" | "popover", RNShadow> = {
  glass: {
    shadowColor: color.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 6,
  },
  lifted: {
    shadowColor: color.ink,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.1,
    shadowRadius: 48,
    elevation: 12,
  },
  islandDock: {
    shadowColor: island.fill,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 32,
    elevation: 20,
  },
  overlay: {
    shadowColor: color.ink,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.1,
    shadowRadius: 48,
    elevation: 12,
  },
  popover: {
    shadowColor: color.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 6,
  },
};

/**
 * §2 — the two edges that separate real glass from a translucent rectangle. RN has no
 * `inset` box-shadow, so the highlight is drawn as a 1px top border and the hairline as the
 * view's own border. Apply both to every glass surface.
 */
export const glassEdge = {
  borderWidth: 1,
  borderColor: glass.edgeHairline,
  borderTopColor: glass.edgeHighlight,
} as const;

/** Reanimated `withSpring` configs. */
export const spring = motion.spring;

/** Reanimated `withTiming` durations (ms), for the rare case a spring isn't the right fit. */
export const duration = motion.duration;

/**
 * RN `Text` doesn't support `letterSpacing` in em — convert per font size at the call site:
 * `letterSpacing: trackingToPx(type.title)`.
 */
export function trackingToPx(step: { fontSize: number; tracking: number }): number {
  return step.tracking * step.fontSize;
}
