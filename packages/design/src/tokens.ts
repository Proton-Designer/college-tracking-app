/**
 * Ihsan design tokens — v3.
 *
 * The merge directive rules that LifeOS's dark, domain-coloured system is the base aesthetic and
 * that its layout grammar wins. This file is that ruling in values.
 *
 * **What changed and what did not.** Aurora v2's *surface* is superseded — the light glass field,
 * the four aurora stops and the near-black island were a light-mode language and none of them
 * survive a dark ground. Aurora v2's *architecture* survives completely: one source of truth here,
 * transcribed into `tailwind.css` (web) and re-exported by `native.ts` (mobile), three surface
 * tiers and no fourth, mandatory glass fallbacks, the type ramp, the spacing and radius scales, and
 * the rule that nobody hand-tunes a value in one consumer. **Every exported key name is preserved**
 * so every existing component keeps compiling; the values moved, the vocabulary did not.
 *
 * **Dark only, deliberately.** There is no light palette and no `prefers-color-scheme` branch. One
 * theme executed well beats two executed adequately, and the product is a night-and-early-morning
 * tool. If a light theme is ever wanted it is a second token set behind this same interface, not a
 * set of overrides sprinkled through components.
 *
 * Contrast note: `color.accent` is used as *text* in ~20 places across both apps, so it is the
 * light periwinkle rather than the saturated indigo v2 used. Saturated fills (primary and
 * destructive buttons) therefore take a near-black label — `color.accentOn` — which is the correct
 * pairing on a dark ground and is checked on each app's own /design route.
 *
 * Pure TS. No React, no DOM, no React Native imports — importable from a Node script, a Tailwind
 * config, or a native app equally.
 */

export const color = {
  /** The ground everything sits on. Near-black, faintly cool. */
  ground: "#0A0A0C",
  /** Cards, panels, the sidebar. The single step up from ground that carries all content. */
  surface: "#131316",
  /** Wells, inputs, inset rows — a step *up* in lightness on dark, which is how recession reads here. */
  surfaceSunken: "#1C1C20",
  /** Warm off-white. Never pure #FFF: a pure white on near-black glares at 2am. */
  ink: "#F2EFEC",
  inkMuted: "#9A9AA2",
  /**
   * **Never body text.** Clears 3:1 against `ground` for large text and non-text graphics, and does
   * not clear 4.5:1 — by design, since its job is to be quieter than `inkMuted`. Legitimate uses:
   * de-emphasised fractions of a metric, ghost lanes, disabled controls (WCAG-exempt), and the
   * "other/untracked" chart series.
   */
  inkFaint: "#6A6A72",
  /** Both are alpha over the ground so a panel edge reads the same on every surface tier. */
  hairline: "rgba(255,255,255,0.10)",
  border: "rgba(255,255,255,0.16)",
  /**
   * Periwinkle. Continuous with v2's deliberate refusal of Apple's #007AFF, lifted for a dark
   * ground: ~8:1 against `ground`, so it is safe as link and label text, which is how most of the
   * codebase already uses it.
   */
  accent: "#8FA0FF",
  accentHover: "#A9B6FF",
  accentWash: "rgba(143,160,255,0.14)",
  /**
   * The label colour on a saturated fill (primary/destructive buttons). White on either fill lands
   * near 3.7:1 and fails; near-black lands above 5:1 on both. A decision still looks like a
   * decision — it is opaque and final — it simply carries dark type here.
   */
  accentOn: "#0A0A0C",

  /**
   * Risk bands, restated for a dark ground. Semantics unchanged — `riskBands` stays ordered
   * low → critical and `RiskBand` keeps its four members — so every existing consumer keeps working.
   * Washes are alpha rather than opaque tints so they compose over any surface tier.
   */
  riskLow: "#3FBF8F",
  riskLowWash: "rgba(63,191,143,0.14)",
  riskModerate: "#E8B33C",
  riskModerateWash: "rgba(232,179,60,0.14)",
  riskHigh: "#F0894B",
  riskHighWash: "rgba(240,137,75,0.14)",
  riskCritical: "#E85050",
  riskCriticalWash: "rgba(232,80,80,0.14)",
} as const;

/**
 * The five life domains, as colour. Taken from LifeOS verbatim — this is the part of Ayman's system
 * that does the most work, and re-picking the hues would have thrown away the recognition his app
 * already built.
 *
 * Domain colour is *information*, never decoration: an Hour on the Wall glows the domain it served,
 * the Signal ring segments by domain, a sidebar item tints by destination. Do not apply one because
 * a surface looks plain.
 */
export const domainColor = {
  deen: "#E0A030",
  business: "#4CAF7D",
  school: "#6AA9FF",
  fitness: "#9085E9",
  work: "#D55181",
} as const;

export type DomainColorKey = keyof typeof domainColor;

/**
 * Chart series. Deliberately a *different, darker* set from `domainColor` — LifeOS validated these
 * for colour-vision deficiency against each other, which matters when five series sit in one donut
 * and cannot rely on position to be told apart. `noise` and `other` are chart-only: they are not
 * domains and must never appear in a domain picker.
 */
export const chartSeries = {
  deen: "#C98500",
  business: "#199E70",
  school: "#3987E5",
  fitness: "#9085E9",
  work: "#D55181",
  noise: "#E66767",
  other: "#6A6A72",
} as const;

/**
 * The ambient field. v2's four aurora stops are replaced by LifeOS's single oxblood glow — a
 * low-saturation radial wash behind the ground, warm enough to keep a near-black page from reading
 * as a terminal.
 *
 * The key names are preserved because `auroraForRisk` and both `Aurora` components still import
 * them; the values are now points along one warm ramp rather than four independent hues.
 */
export const aurora = {
  /** The base glow, used behind the sidebar and at the top of a page. */
  periwinkle: "#2B0E13",
  lilac: "#331119",
  mint: "#1A1013",
  blush: "#3D1520",
} as const;

/** The floating dock (mobile) — a raised surface on dark, not the near-black slab v2 used. */
export const island = {
  fill: "#1C1C20",
  /** Alpha applied over a 32px blur. The dock is glass, not an opaque rectangle. */
  fillAlpha: 0.92,
  ink: "#F2EFEC",
  inkDim: "rgba(242,239,236,0.55)",
  /** Distance from the safe-area inset to the bottom of the dock. */
  offset: 20,
  /** Bottom padding every scroll container must reserve so content is never trapped under it. */
  contentInset: 88,
} as const;

/**
 * Three surface tiers. **Only these three.** A fourth is someone inventing a value.
 *
 * `fallback` stays MANDATORY: backdrop-filter fails on older Android WebViews and under
 * reduced-transparency settings, and a surface that degrades to unreadable is a bug. On a dark
 * ground the fallbacks are near-opaque, which is also what LifeOS ships — his panels are solid
 * `bg-card` with a hairline, and the blur is a refinement rather than the mechanism.
 */
export const glass = {
  base: {
    fill: "rgba(19,19,22,0.88)",
    fallback: "#131316",
    blur: 24,
    saturate: 1.4,
  },
  raised: {
    fill: "rgba(28,28,32,0.94)",
    fallback: "#1C1C20",
    blur: 32,
    saturate: 1.4,
  },
  sunken: {
    fill: "rgba(10,10,12,0.60)",
    fallback: "#0F0F12",
    blur: 16,
    saturate: 1.2,
  },
  /**
   * The two edges. On dark these invert from v2: the highlight is a faint white top edge and the
   * hairline is also white-alpha, because a dark outline on a dark ground is invisible.
   */
  edgeHighlight: "rgba(255,255,255,0.06)",
  edgeHairline: "rgba(255,255,255,0.10)",
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
 * The ambient glow's stop pair for a given computed risk band.
 *
 * `null` is still a first-class value and still the rule that keeps this honest: **an account with
 * no computed risk gets no atmosphere at all**, just flat `ground`. The glow is an instrument
 * reading, not decoration applied for mood. Never call this with a fabricated band to make a screen
 * look alive.
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
  /** Display + UI. Geist: neutral, tight, and quiet enough that domain colour carries the identity. */
  sans: "Geist",
  /**
   * Data, eyebrows, and every number. LifeOS sets all figures in mono with tabular numerals and it
   * is half of why his data surfaces read calm — columns of digits stop shifting as they update.
   */
  mono: "Geist Mono",
  /**
   * @deprecated No serif display face exists in v2 or v3. Retained ONLY so a straggler renders as
   * Geist instead of falling back to Georgia. Remove every usage; this key goes when the last does.
   */
  serif: "Geist",
} as const;

interface TypeStep {
  fontSize: number;
  lineHeight: number;
  fontFamily: string;
  fontWeight: 400 | 500 | 600;
  tracking: number;
  uppercase?: true;
}

/** Sizes/line-heights in px (native consumers convert 1:1 to dp). Unchanged from v2. */
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

/** 4px base grid. The spacing scale was never the problem and does not move. */
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

/** Unchanged from v2. LifeOS's rounded-2xl panels land between `lg` and `xl` and are served by both. */
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
 * Elevation is nearly retired on a dark ground: a drop shadow under a #131316 card on a #0A0A0C
 * page is invisible, and LifeOS uses border + tint for hierarchy instead. What remains is kept
 * subtle and reserved for things that genuinely float above the page — modals and the dock.
 */
export const elevation = {
  glass: {
    web: "0 1px 0 rgba(255,255,255,.03) inset",
  },
  lifted: {
    web: "0 8px 24px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.40)",
  },
  islandDock: {
    web: "0 8px 24px rgba(0,0,0,.60), 0 24px 64px rgba(0,0,0,.45)",
  },
  /** @deprecated v1 names, retained so existing consumers compile. Map to `glass`/`lifted`. */
  overlay: {
    web: "0 8px 24px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.40)",
  },
  popover: {
    web: "0 8px 24px rgba(0,0,0,.55), 0 2px 6px rgba(0,0,0,.40)",
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
 * Layering, unchanged. `island` sits above sticky content but below modals: a modal must be able to
 * cover the dock.
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
