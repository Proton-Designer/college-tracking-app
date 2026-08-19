/**
 * CollegeOS design tokens — "Instrument".
 *
 * Source of truth: docs/DESIGN_SYSTEM.md, ratified by the Lead. Every value here is transcribed
 * from that document verbatim; do not hand-tune a value here without updating the doc (or vice
 * versa) — they must never drift apart.
 *
 * Pure TS. No React, no DOM, no React Native imports — this file must be importable from a Node
 * script, a Tailwind config, or a native app equally.
 */

export const color = {
  ground: "#FAFAF8",
  surface: "#FFFFFF",
  surfaceSunken: "#F2F2EF",
  ink: "#16181D",
  inkMuted: "#5C6270",
  inkFaint: "#8A8E85",
  hairline: "#E3E4E0",
  border: "#7D8178",
  accent: "#0B5D66",
  accentHover: "#094A52",
  accentWash: "#E8F1F1",

  riskLow: "#3F7D5C",
  riskLowWash: "#EDF4F0",
  riskModerate: "#8A6516",
  riskModerateWash: "#F7F1E3",
  riskHigh: "#B4501A",
  riskHighWash: "#FBEEE6",
  riskCritical: "#A8231F",
  riskCriticalWash: "#FAEBEA",
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

export const fontFamily = {
  serif: "IBM Plex Serif",
  sans: "IBM Plex Sans",
  mono: "IBM Plex Mono",
} as const;

interface TypeStep {
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  fontWeight: 400 | 500 | 600;
  tracking: number;
  uppercase?: true;
}

/** Sizes/line-heights in px (native consumers convert 1:1 to dp). */
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
  displayXl: { fontSize: 56, lineHeight: 60, fontFamily: fontFamily.serif, fontWeight: 600, tracking: -0.02 },
  displayL: { fontSize: 40, lineHeight: 44, fontFamily: fontFamily.serif, fontWeight: 600, tracking: -0.02 },
  displayM: { fontSize: 28, lineHeight: 34, fontFamily: fontFamily.serif, fontWeight: 600, tracking: -0.01 },
  title: { fontSize: 20, lineHeight: 28, fontFamily: fontFamily.sans, fontWeight: 600, tracking: -0.01 },
  bodyL: { fontSize: 17, lineHeight: 26, fontFamily: fontFamily.sans, fontWeight: 400, tracking: 0 },
  body: { fontSize: 15, lineHeight: 22, fontFamily: fontFamily.sans, fontWeight: 400, tracking: 0 },
  bodyS: { fontSize: 13, lineHeight: 19, fontFamily: fontFamily.sans, fontWeight: 400, tracking: 0 },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: fontFamily.mono,
    fontWeight: 500,
    tracking: 0.1,
    uppercase: true,
  },
  metricXl: { fontSize: 44, lineHeight: 48, fontFamily: fontFamily.mono, fontWeight: 500, tracking: -0.01 },
  metric: { fontSize: 22, lineHeight: 26, fontFamily: fontFamily.mono, fontWeight: 500, tracking: 0 },
  caption: { fontSize: 12, lineHeight: 16, fontFamily: fontFamily.mono, fontWeight: 400, tracking: 0.02 },
};

/** 4px base grid, exactly the scale in §4 — do not interpolate new steps. */
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

export const radius = {
  sm: 3,
  md: 5,
  lg: 8,
  pill: 999,
} as const;

export const border = {
  hairlineWidth: 1,
} as const;

/** Only these two shadows exist in the whole system — cards/panels/rows get none. */
export const elevation = {
  overlay: {
    web: "0 1px 2px rgba(22,24,29,.04), 0 8px 24px rgba(22,24,29,.08)",
  },
  popover: {
    web: "0 1px 2px rgba(22,24,29,.06), 0 4px 12px rgba(22,24,29,.10)",
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
 * Not specified numerically in DESIGN_SYSTEM.md §4 — inferred to support layering (dropdowns,
 * overlays, toasts) consistently across both apps. Flagged to the Lead; revise here (and only
 * here) if a canonical scale is ratified later.
 */
export const zIndex = {
  base: 0,
  dropdown: 100,
  sticky: 200,
  overlay: 300,
  modal: 400,
  toast: 500,
  tooltip: 600,
} as const;
