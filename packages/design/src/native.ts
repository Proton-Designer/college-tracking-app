/**
 * RN-shaped design values. Pure TS/objects only — no `react-native` import here, so this file
 * stays testable and importable outside a native runtime. Consumers pass these into RN's
 * `StyleSheet.create` / Reanimated APIs directly.
 */
import { color, fontFamily, motion, radius, riskBandColor, riskBands, space, type } from "./tokens";
import type { RiskBand } from "./tokens";

export { color, fontFamily, radius, riskBandColor, riskBands, space, type };
export type { RiskBand };

/**
 * RN has no native hairline color; consumers pair this width with `color.hairline` or
 * `color.border` depending on whether the line is decorative or interactive (§2 foundation).
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
 * Only these two shadows exist in the system (§4) — both approximate the web box-shadow's larger,
 * more visible layer, since RN can't stack two shadows on one view without a wrapper.
 */
export const shadow: Record<"overlay" | "popover", RNShadow> = {
  overlay: {
    shadowColor: color.ink,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  popover: {
    shadowColor: color.ink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
};

/** Reanimated `withSpring` configs, transcribed from §5. */
export const spring = motion.spring;

/** Reanimated `withTiming` durations (ms), for the rare case a spring isn't the right fit. */
export const duration = motion.duration;

/**
 * RN `Text` doesn't support `letterSpacing` in em — convert per font size at the call site:
 * `letterSpacing: type.title.tracking * type.title.fontSize`.
 */
export function trackingToPx(step: { fontSize: number; tracking: number }): number {
  return step.tracking * step.fontSize;
}
