"use client";

import { useSyncExternalStore } from "react";
import { auroraForRisk, type RiskBand } from "@collegeos/design";

export interface AuroraProps {
  /** The real computed band this screen is reporting, or null. Never fabricate one to make a
   *  screen look alive -- `auroraForRisk(null)` is a first-class value: no history, no atmosphere.
   *  See DESIGN_LANGUAGE_V2 §6. */
  band: RiskBand | null;
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
 * The ambient field, §6. An instrument reading, not decoration: its hue mix is derived from a
 * real computed RiskBand and it renders once per navigation -- it never animates, pulses, or
 * breathes. `prefers-reduced-motion` and `prefers-reduced-transparency` both collapse it to flat
 * ground, same as a null band. Ambient only: risk is always also stated in text and a RiskPill.
 */
export function Aurora({ band, variant = "fixed" }: AuroraProps) {
  const reducedMotion = usePrefersReduced("(prefers-reduced-motion: reduce)");
  const reducedTransparency = usePrefersReduced("(prefers-reduced-transparency: reduce)");

  const stops = reducedMotion || reducedTransparency ? null : auroraForRisk(band);
  if (!stops) return null;

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
        // than the other), colour stays visible across the upper third, falls off by ~62%.
        background: `radial-gradient(ellipse 65% 45% at 10% -10%, ${a} 0%, transparent 62%),
          radial-gradient(ellipse 65% 45% at 90% -10%, ${b} 0%, transparent 62%)`,
        opacity: 0.5,
      }}
    />
  );
}
