"use client";

import { useSyncExternalStore } from "react";
import { aurora, auroraForRisk, type RiskBand } from "@collegeos/design";

// §6.0 -- the ground is never bare. A fixed, unvarying pair used only when there's no derived
// band to report -- honest for the same reason the landing page's fixed pair is: it never
// varies, so it can't misreport anything. Someone learning to read the aurora is learning to
// read *change*; a flat neutral wash is the absence of a reading, not a false one.
const RESTING_STOPS = [aurora.periwinkle, aurora.lilac] as const;
const RESTING_OPACITY = 0.15;
const AURORA_OPACITY = 0.5;

export interface AuroraProps {
  /** The real computed band this screen is reporting, or null. Never fabricate one to make a
   *  screen look alive. `null` (no signal) no longer means "nothing paints" -- it means the
   *  resting wash paints instead, at RESTING_OPACITY. See DESIGN_LANGUAGE_V2 §6/§6.0. Ignored
   *  when `stops` is provided. */
  band?: RiskBand | null;
  /**
   * Bypasses `auroraForRisk` entirely and paints this exact stop pair at full AURORA_OPACITY.
   * The ONLY sanctioned use is a page with no signed-in user's state to misreport -- the landing
   * page, painting the aurora as design rather than an instrument reading. Never pass a
   * `RiskBand` here to get a decorative result through the band path instead.
   */
  stops?: readonly [string, string];
  /** "fixed" (default) paints behind the whole viewport, for mounting once per screen.
   *  "contained" fills its nearest positioned ancestor instead -- for a showcase/preview box
   *  that needs to demonstrate the field without covering the page. */
  variant?: "fixed" | "contained";
}

function subscribe(query: string) {
  return (onChange: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  };
}

/** SSR-safe: assumes no reduced-preference on the server, corrected on the client's first
 *  paint via useSyncExternalStore -- never setState-in-effect, which cascades an extra render. */
function usePrefersReduced(query: string): boolean {
  return useSyncExternalStore(
    subscribe(query),
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * The ambient field, §6/§6.0. Two layers, only one of which ever means anything, and they never
 * stack -- one gradient, one opacity, chosen by exactly which case applies:
 *   1. `stops` given -> that exact pair at AURORA_OPACITY (landing's design exception).
 *   2. `auroraForRisk(band)` resolves -> a real instrument reading at AURORA_OPACITY.
 *   3. Neither -> the fixed neutral resting wash at RESTING_OPACITY, so the ground is never
 *      bare and glass never degenerates into a flat white card next to a screen that has one.
 * Renders once per navigation -- it never animates, pulses, or breathes. `prefers-reduced-motion`
 * and `prefers-reduced-transparency` both collapse it to flat ground, no exceptions.
 */
export function Aurora({ band = null, stops: fixedStops, variant = "fixed" }: AuroraProps) {
  const reducedMotion = usePrefersReduced("(prefers-reduced-motion: reduce)");
  const reducedTransparency = usePrefersReduced("(prefers-reduced-transparency: reduce)");

  if (reducedMotion || reducedTransparency) return null;

  const derivedStops = fixedStops ?? auroraForRisk(band);
  const stops = derivedStops ?? RESTING_STOPS;
  const opacity = derivedStops ? AURORA_OPACITY : RESTING_OPACITY;
  const [a, b] = stops;

  return (
    <div
      aria-hidden="true"
      className={
        variant === "fixed"
          ? "pointer-events-none fixed inset-0 -z-10"
          : "pointer-events-none absolute inset-0 z-0"
      }
      style={{
        // A bloom, not a wash -- present but light, per the Lead's two live reviews. The first
        // pass (full-bleed, opacity 0.55, transparent stop at 55-60%) tinted the whole screen
        // and fought the glass panels sitting on it; correcting to opacity 0.4 with an early
        // 45% falloff over-corrected the other way and made the field nearly invisible, which
        // breaks glass too -- a panel only reads as glass when there's something behind it to
        // refract. Landed between: both top corners bloom symmetrically (not one pooling more
        // than the other), colour stays visible across the upper third, falls off by ~62%. Same
        // shape for the resting wash, just dialed down to RESTING_OPACITY.
        background: `radial-gradient(ellipse 65% 45% at 10% -10%, ${a} 0%, transparent 62%),
          radial-gradient(ellipse 65% 45% at 90% -10%, ${b} 0%, transparent 62%)`,
        opacity,
      }}
    />
  );
}
