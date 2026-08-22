/**
 * CollegeOS design tokens — "Aurora" (v2).
 *
 * Source of truth: docs/DESIGN_LANGUAGE_V2.md, ratified by the Lead 2026-08-22. Every value here
 * is transcribed from that document verbatim; do not hand-tune a value here without updating the
 * doc (or vice versa) — they must never drift apart.
 *
 * v2 replaces the "Instrument" surface (cream ground, serif display, hairline boxes, 3/5/8 radii)
 * with a cool iridescent glass field. **Key names are deliberately preserved** so every existing
 * consumer keeps compiling: the values changed, the vocabulary did not. New vocabulary (glass,
 * aurora, island) is additive.
 *
 * Pure TS. No React, no DOM, no React Native imports — this file must be importable from a Node
 * script, a Tailwind config, or a native app equally.
 */

export const color = {
  /** Cool near-white. v1's warm #FAFAF8 is gone — see DESIGN_LANGUAGE_V2 §1. */
  ground: "#F4F6FB",
  surface: "#FFFFFF",
  surfaceSunken: "#EDF0F7",
  /** Near-black with a blue cast. Never pure #000. */
  ink: "#0E1220",
  inkMuted: "#5A6178",
  /**
   * **Never body text.** This clears WCAG's 3:1 bar for large text (≥24px) and non-text graphics,
   * and it does NOT clear 4.5:1 — by design, because its whole job is to be quieter than
   * `inkMuted`. Legitimate uses: the de-emphasised fractional part of a metric (§3, always ≥24px),
   * the Day Ribbon's ghost lane (non-text), and disabled controls (WCAG-exempt).
   *
   * Was `#8E95A8`, which measured **2.51:1** on the worst real surface (glass-sunken over the
   * lightest aurora stop) and so failed even the large-text bar.
   */
  inkFaint: "#818798",
  hairline: "#E1E6F0",
  border: "#C2C9D8",
  /**
   * Indigo. Deliberately NOT #007AFF — Apple's blue would make this a straight copy of the
   * reference. This hue sits inside the aurora's periwinkle→lilac range while staying its own.
   */
  accent: "#3A56F0",
  accentHover: "#2B41C4",
  accentWash: "#EBEEFE",

  riskLow: "#1F785B",
  riskLowWash: "#E9F4F0",
  riskModerate: "#8E6208",
  riskModerateWash: "#F8F1E2",
  riskHigh: "#AC4F19",
  riskHighWash: "#FCEEE6",
  riskCritical: "#C42B2B",
  riskCriticalWash: "#FBEAEA",
} as const;

/**
 * The ambient field's four stops (§1). These are NEVER component fills — only atmosphere.
 * Which stops are mixed is derived from a real computed RiskBand; see `auroraForRisk`.
 */
export const aurora = {
  periwinkle: "#BCD2FF",
  lilac: "#D7C6FF",
  mint: "#BFF0E2",
  blush: "#FFD3E4",
} as const;

/** The floating dock (§5). */
export const island = {
  fill: "#0B0E14",
  /** Alpha applied over a 32px blur. The dock is glass, not a black rectangle. */
  fillAlpha: 0.88,
  ink: "#FFFFFF",
  inkDim: "rgba(255,255,255,0.55)",
  /** Distance from the safe-area inset to the bottom of the dock. */
  offset: 20,
  /** Bottom padding every scroll container must reserve so content is never trapped under it. */
  contentInset: 88,
} as const;

/**
 * Three glass tiers — §2. Only these three exist; a fourth is someone inventing a value.
 *
 * `fallback` is MANDATORY, not optional: backdrop-filter fails on older Android WebViews and under
 * reduced-transparency settings. Glass that degrades to an unreadable surface is a bug.
 */
export const glass = {
  base: {
    fill: "rgba(255,255,255,0.62)",
    fallback: "rgba(255,255,255,0.92)",
    blur: 24,
    saturate: 1.8,
  },
  raised: {
    fill: "rgba(255,255,255,0.78)",
    fallback: "rgba(255,255,255,0.96)",
    blur: 32,
    saturate: 1.8,
  },
  sunken: {
    fill: "rgba(255,255,255,0.38)",
    fallback: "rgba(255,255,255,0.86)",
    blur: 16,
    saturate: 1.4,
  },
  /** The two edges that separate real glass from a translucent rectangle (§2). */
  edgeHighlight: "rgba(255,255,255,0.85)",
  edgeHairline: "rgba(14,18,32,0.06)",
} as const;

/** Ordered low → critical. Drives RiskPill/Badge and anywhere a risk band is enumerated. */
export const riskBands = ["low", "moderate", "high", "critical"] as const;
export type RiskBand = (typeof riskBands)[number];

export const riskBandColor: Record<RiskBand, { fg: string; wash: string }> = {
  low: { fg: color.riskLow, wash: color.riskLowWash },
  moderate: { fg: color.riskModerate, wash: color.riskModerateWash },
  high: { fg: color.riskHigh, wash: color.riskHighWash },
  critical: { fg: color.riskCritical, wash: color.riskCriticalWash },
};

/**
 * §6 — the aurora's stop pair for a given computed risk band.
 *
 * `null` is a first-class value and the rule that keeps this honest: **an account with no computed
 * risk gets no atmosphere at all**, just flat `ground`. The aurora is an instrument reading, not
 * decoration applied for mood. Never call this with a fabricated band to make a screen look alive.
 */
export function auroraForRisk(band: RiskBand | null): readonly [string, string] | null {
  if (band === null) return null;
  switch (band) {
    case "low":
      return [aurora.mint, aurora.periwinkle] as const;
    case "moderate":
      return [aurora.periwinkle, aurora.lilac] as const;
    case "high":
      return [aurora.lilac, aurora.blush] as const;
    case "critical":
      return [aurora.blush, aurora.lilac] as const;
  }
}

export const fontFamily = {
  /** Display + UI. A grotesque with real character; holds at 52px, stays quiet at 15px. */
  sans: "Instrument Sans",
  /** Data + eyebrows. Measurement deserves a machine face. */
  mono: "Geist Mono",
  /**
   * @deprecated v2 removes the serif display face entirely (§3) — it was the loudest part of the
   * rejected v1 look. The key is retained ONLY so a straggler renders as Instrument Sans instead
   * of falling back to Georgia. Remove every usage; this key goes when the last one does.
   */
  serif: "Instrument Sans",
} as const;

interface TypeStep {
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  fontWeight: 400 | 500 | 600;
  tracking: number;
  uppercase?: true;
}

/** Sizes/line-heights in px (native consumers convert 1:1 to dp). §3. */
export const type: Record<
  | "displayXl"
  | "displayL"
  | "displayM"
  | "title"
  | "bodyL"
  | "body"
  | "bodyS"
  | "label"
  | "metricXl"
  | "metric"
  | "caption",
  TypeStep
> = {
  displayXl: { fontSize: 52, lineHeight: 54, fontFamily: fontFamily.sans, fontWeight: 600, tracking: -0.03 },
  displayL: { fontSize: 38, lineHeight: 42, fontFamily: fontFamily.sans, fontWeight: 600, tracking: -0.025 },
  displayM: { fontSize: 28, lineHeight: 34, fontFamily: fontFamily.sans, fontWeight: 600, tracking: -0.02 },
  title: { fontSize: 19, lineHeight: 26, fontFamily: fontFamily.sans, fontWeight: 600, tracking: -0.015 },
  bodyL: { fontSize: 17, lineHeight: 26, fontFamily: fontFamily.sans, fontWeight: 400, tracking: 0 },
  body: { fontSize: 15, lineHeight: 22, fontFamily: fontFamily.sans, fontWeight: 400, tracking: 0 },
  bodyS: { fontSize: 13, lineHeight: 19, fontFamily: fontFamily.sans, fontWeight: 400, tracking: 0 },
  /** The eyebrow. Mono, uppercase, open tracking. */
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fontFamily.mono,
    fontWeight: 500,
    tracking: 0.08,
    uppercase: true,
  },
  metricXl: { fontSize: 46, lineHeight: 48, fontFamily: fontFamily.mono, fontWeight: 500, tracking: -0.02 },
  metric: { fontSize: 22, lineHeight: 26, fontFamily: fontFamily.mono, fontWeight: 500, tracking: 0 },
  caption: { fontSize: 12, lineHeight: 16, fontFamily: fontFamily.mono, fontWeight: 400, tracking: 0.02 },
};

/** 4px base grid — unchanged from v1. The spacing scale was never the problem. */
export const space = {
  0: 0,
  1: 2,
  2: 4,
  3: 8,
  4: 12,
  5: 16,
  6: 20,
  7: 24,
  8: 32,
  9: 40,
  10: 56,
  11: 80,
} as const;

/**
 * §4 — wholesale replaced. v1's 3/5/8 is precisely what made the old UI read as barebones.
 * `xl` is new (modals, sheets, the island).
 */
export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const border = {
  hairlineWidth: 1,
} as const;

/**
 * §4. v1's rule that "cards get no shadow" is REVERSED: glass without elevation reads as a flat
 * translucent box, and `glass` is what makes a panel float.
 */
export const elevation = {
  glass: {
    web: "0 1px 1px rgba(14,18,32,.03), 0 8px 24px rgba(14,18,32,.06)",
  },
  lifted: {
    web: "0 2px 4px rgba(14,18,32,.04), 0 18px 48px rgba(14,18,32,.10)",
  },
  islandDock: {
    web: "0 8px 24px rgba(11,14,20,.28), 0 24px 64px rgba(11,14,20,.22)",
  },
  /** @deprecated v1 names, retained so existing consumers compile. Map to `glass`/`lifted`. */
  overlay: {
    web: "0 2px 4px rgba(14,18,32,.04), 0 18px 48px rgba(14,18,32,.10)",
  },
  popover: {
    web: "0 1px 1px rgba(14,18,32,.03), 0 8px 24px rgba(14,18,32,.06)",
  },
} as const;

export const contentWidth = {
  app: 1120,
  prose: 720,
} as const;

export const motion = {
  duration: {
    instant: 90,
    quick: 150,
    base: 220,
    deliberate: 380,
  },
  easing: {
    /** Web CSS cubic-bezier strings. Native uses springs instead — see `spring` below. */
    decelerate: "cubic-bezier(0.2, 0, 0, 1)",
    exit: "cubic-bezier(0.4, 0, 1, 1)",
  },
  spring: {
    standard: { damping: 22, stiffness: 240, mass: 1 },
    sheet: { damping: 26, stiffness: 190, mass: 1 },
  },
} as const;

/**
 * Not specified numerically in the design docs — inferred to support layering (dropdowns,
 * overlays, toasts) consistently across both apps. `island` sits above sticky content but below
 * modals: a modal must be able to cover the dock.
 */
export const zIndex = {
  base: 0,
  dropdown: 100,
  sticky: 200,
  island: 250,
  overlay: 300,
  modal: 400,
  toast: 500,
  tooltip: 600,
} as const;
