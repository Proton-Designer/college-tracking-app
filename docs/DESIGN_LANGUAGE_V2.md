# CollegeOS Design Language v2 — "Aurora"

> **Ratified by the Lead, 2026-08-22.** This supersedes `docs/DESIGN_SYSTEM.md` ("Instrument") as
> the visual authority. Instrument's *structural* rules survive; its surface does not.
>
> Every value here is transcribed into `packages/design/src/tokens.ts`,
> `packages/design/src/tailwind.css`, and `packages/design/src/native.ts`. Those four files must
> never drift. Do not hand-tune a value in one of them.

---

## 0. Why this exists

The user's verdict on v1, verbatim: *"looks primal and barebones, it's terrible."* That is a fair
reading. Instrument was a broadsheet — cream ground, serif display, hairline boxes, zero radius,
text-only tab bar. It was internally consistent and it was cold.

The brief pins the new direction precisely: a **light iridescent "liquid glass"** field, soft
translucent panels, generous radii, and a **floating dark glass island** as the primary nav. Where
the brief specifies, the brief wins — no reinterpretation.

Where the brief leaves an axis free, we spend it on the one thing a fintech reference cannot give
us: **making the atmosphere mean something.** See §6.

---

## 1. Palette

Cool, not warm. Instrument's `#FAFAF8` cream is gone — the reference field is decidedly cool, and
warm-cream-plus-serif is the single most over-produced look in this category.

```
ground        #F4F6FB   cool near-white, the base everything floats on
ink           #0E1220   near-black with a blue cast, never pure #000
inkMuted      #5A6178   secondary text, labels that still need to be read
inkFaint      #8E95A8   de-emphasised precision, disabled, ghost lanes
accent        #3A56F0   indigo — interactive, active, the one saturated hue
accentPressed #2B41C4
```

**Deliberately not `#007AFF`.** Apple's blue would make this a straight copy of the reference.
`#3A56F0` sits natively inside the aurora's periwinkle-to-lilac range while remaining unmistakably
its own hue.

### Aurora stops

The ambient field is built from four stops over `ground`. They are never used as fills for
components — only as the atmosphere.

```
auroraPeriwinkle  #BCD2FF
auroraLilac       #D7C6FF
auroraMint        #BFF0E2
auroraBlush       #FFD3E4
```

### The island

```
island        #0B0E14   near-black, the floating dock
islandInk     #FFFFFF
islandInkDim  rgba(255,255,255,0.55)
```

### Risk bands

Restated for a cool ground. The semantics are unchanged — `riskBands` stays ordered low → critical
and `RiskBand` keeps its four members, so every existing consumer keeps working.

```
low       #1F7A5C   wash rgba(31,122,92,0.10)
moderate  #B07A0A   wash rgba(176,122,10,0.10)
high      #D2601F   wash rgba(210,96,31,0.10)
critical  #C42B2B   wash rgba(196,43,43,0.10)
```

---

## 2. Glass

Three surface tiers. **Only these three.** A fourth would be someone inventing a value.

| Tier | Fill | Blur | Use |
|---|---|---|---|
| `glass` | `rgba(255,255,255,0.62)` | 24px, saturate 180% | cards, panels, list containers |
| `glassRaised` | `rgba(255,255,255,0.78)` | 32px, saturate 180% | modals, sheets, popovers |
| `glassSunken` | `rgba(255,255,255,0.38)` | 16px | wells, inset rows, empty states |

Every glass surface carries **two edges**, and this is what separates real glass from a translucent
rectangle:

- an inner top highlight: `inset 0 1px 0 rgba(255,255,255,0.85)`
- an outer hairline: `0 0 0 1px rgba(14,18,32,0.06)`

**Fallback is mandatory.** `backdrop-filter` fails on older Android WebViews and is disabled by
some privacy settings. Every glass surface must specify an opaque fallback fill
(`rgba(255,255,255,0.92)`) behind an `@supports` query on web, and native must degrade to a solid
fill when `expo-blur` is unavailable. **Glass that fails to an unreadable surface is a bug, not a
degradation.**

---

## 3. Type

Instrument's IBM Plex Serif is **removed entirely.** The display face was the loudest part of the
old look and the user rejected it.

| Role | Face | Why |
|---|---|---|
| Display + UI | **Instrument Sans** | A grotesque with real character — tight apertures, a distinctive `g` — that holds up at 52px and stays quiet at 15px. Not Inter, which is the default answer. It also keeps continuity with the system's original name. |
| Data + eyebrows | **Geist Mono** | Measurement deserves a machine face. Replaces Plex Mono; more geometric, sits better against a cool field. |

Both are on Google Fonts (`next/font/google` on web, `expo-font` on native).

### Scale

Tighter tracking and larger display sizes than v1 — the reference's headlines are big, heavy and
close-set.

```
displayXl   52 / 54   Instrument Sans 600   tracking -0.03
displayL    38 / 42   Instrument Sans 600   tracking -0.025
displayM    28 / 34   Instrument Sans 600   tracking -0.02
title       19 / 26   Instrument Sans 600   tracking -0.015
bodyL       17 / 26   Instrument Sans 400
body        15 / 22   Instrument Sans 400
bodyS       13 / 19   Instrument Sans 400
eyebrow     11 / 14   Geist Mono 500        tracking +0.08, uppercase
metricXl    46 / 48   Geist Mono 500        tracking -0.02
metric      22 / 26   Geist Mono 500
caption     12 / 16   Geist Mono 400        tracking +0.02
```

### Numerals — precision is de-emphasised, never hidden

The reference renders `$5,980.98` with the decimals lighter than the integer. Adopt it, because it
encodes something true: the magnitude is the signal, the precision is the detail.

**Integer at `ink`, fractional at `inkFaint`, same size, same face.** Never drop a decimal, never
round for looks. `tabular-nums` everywhere a number can change.

---

## 4. Space, radius, elevation

Space keeps the 4px grid unchanged — it was never the problem.

**Radius is wholesale replaced.** v1's 3/5/8 is what made the old UI read as barebones.

```
sm    10    chips, small controls
md    14    inputs, buttons
lg    20    cards, panels
xl    28    modals, sheets, the island
pill  999
```

```
shadowGlass   0 1px 1px rgba(14,18,32,.03), 0 8px 24px rgba(14,18,32,.06)
shadowLifted  0 2px 4px rgba(14,18,32,.04), 0 18px 48px rgba(14,18,32,.10)
shadowIsland  0 8px 24px rgba(11,14,20,.28), 0 24px 64px rgba(11,14,20,.22)
```

v1's rule that "cards get no shadow" is **reversed.** Glass without elevation reads as a flat
translucent box. `shadowGlass` is what makes it float.

---

## 5. The Island

The primary navigation on **both platforms**. A floating, detached, near-black glass dock.

```
        ┌─────────────────────────────────────────┐
        │  ╭───────────╮                          │
        │  │ ◉  Today  │  ▣    ⇄    ◫    ◷        │   ← active: accent-filled pill,
        │  ╰───────────╯                          │      icon + label
        └─────────────────────────────────────────┘     inactive: icon only
                  ↑ 20px above the safe-area inset
```

- Detached: `bottom = safeAreaInset + 20px`, horizontally centred, never full-bleed.
- `radius.pill`, fill `island` at 0.88 alpha over a 32px blur, `shadowIsland`.
- **Active item only** shows its label, in an `accent` pill. Inactive items are icon-only at
  `islandInkDim`. This is the reference's behaviour and it is also correct: it makes the current
  location unambiguous at a glance.
- Content must reserve `88px` of bottom padding so nothing is ever trapped under the island.
- **Tap target is 44×44 minimum regardless of the visual icon size.** The island is small; the
  hit-boxes are not.
- Label transition on tab change: `motion.duration.quick` width spring. Nothing else animates.

**Icons.** The codebase has no icon set, and v1 avoided one rather than take a dependency for four
labels. An island is icon-first, so that trade has changed. Approved: **`lucide-react`** (web) and
**`lucide-react-native`** (mobile) — one family, both platforms, tree-shakeable, no asset pipeline.

---

## 6. The signature: the Aurora means something

This is the one place we spend boldness, and it is the one thing that is ours rather than the
reference's.

In the reference, the iridescent field is decoration. Here it is **an instrument reading.**

The aurora's hue mix is derived from the day's *real* state — the same `RiskBand` the rest of the
product already computes deterministically in `packages/core`:

| State | Field |
|---|---|
| `low` | mint + periwinkle — cool, calm, wide |
| `moderate` | periwinkle + lilac |
| `high` | lilac + blush, warmer, tighter |
| `critical` | blush dominant, highest saturation |
| **no data** | **flat `ground`, no aurora at all** |

The last row is the rule that keeps this honest. **An account with no history gets no atmosphere.**
The aurora is never decoration applied for mood; if it is showing, it is reporting something the
system actually computed. This is the three laws applied to pixels: *deterministic code calculates,
the surface only interprets.*

### 6.1 Where each screen's band comes from

**There was no day-level risk band before this.** `RiskAssessment` is per-deliverable and
per-course only. The obvious move — `Math.max(...)` inline in an `<Aurora>` component — would put a
domain calculation in a shell (forbidden, CLAUDE.md law 2) and would let web and mobile silently
derive the *same day* differently.

So one definition exists, in core, unit-tested, imported by both platforms:

```ts
import { deriveDayBand } from "@collegeos/core";
deriveDayBand(dayView.risk.deliverableRisks); // RiskBand | null
```

It is a **maximum**, deliberately not an average: a day holding one critical deliverable and nine
low ones *is* a critical day, and averaging would report it as calm — exactly the
comfortable-but-false reading this product exists to argue with. It is deliberately **not** blended
with recovery mode, workload or capacity; those describe the *person*, not deadline exposure, and
each already has its own surface. A number meaning two things at once can be honestly explained as
neither.

Per screen — and where the answer is "none", the screen gets flat ground, which is correct and not
a gap to fill:

| Screen | Band source |
|---|---|
| `/today` | `deriveDayBand(risk.deliverableRisks)` |
| `/courses` | `deriveDayBand` over every course's deliverables |
| `/courses/[id]` | that course's own `CourseRiskSummary.result.band` |
| `/deliverables/[id]` | that deliverable's `result.band` |
| `/review/[date]` | the band recorded **for that date**, never today's — a report is an archival record of a moment |
| `/calendar`, `/insights`, `/settings`, `/focus`, auth, landing | **none — flat ground** |

**Constraints:**
- Derived from an existing computed value. **Never a new number, never a fabricated one.**
- Ambient only — it never carries information the user must read. A colourblind user loses nothing.
  Risk is always *also* stated in text and in a `RiskPill`.
- Renders once per navigation. It does not animate, pulse, or breathe. A background that moves while
  you read is a background that is showing off.
- `prefers-reduced-motion` and `prefers-reduced-transparency` both collapse it to flat `ground`.

### Second signature: the Day Ribbon

`/today`'s plan-vs-actual is the product's whole thesis and v1 rendered it as the letters
`PLAN` / `ACT` beside an empty box. It becomes **two parallel glass lanes** — plan as a ghost lane
(`inkFaint`, unfilled), actual as a solid lane. Divergence is then *literally visible as offset*
rather than described in prose.

Nothing is invented: an unplanned day shows one lane and says so.

---

## 7. What does not change

Non-negotiable, and a revamp is exactly when these get quietly broken:

- **Never fabricate a value.** `—` or omission, never a placeholder number, never a filler chart. A
  page that ends where its content ends is not a defect.
- **Empty states keep explaining *why* they are empty.** Glass does not get to make an empty screen
  look full.
- **Behaviour and information may never diverge across platforms.** Layout and idiom may.
- **Every domain calculation stays in `packages/core`.** A component that computes is a bug.
- Visible keyboard focus on every interactive element — a 2px `accent` ring at 2px offset. Glass
  makes focus rings harder to see, which is a reason to be *more* careful, not less.
- Contrast: body text on glass must clear **4.5:1** measured against the *lightest* point of the
  aurora, not against white. Verify with a real contrast check, not by eye.

---

## 8. Migration rule

Do not port v1 component-by-component into new colours. Every screen gets its **composition**
reconsidered — the user called out "dimensions and component placement" specifically, and a
re-skinned bad layout is still a bad layout.

The order for each screen: what is the one thing this screen exists to tell the user? Lead with
that at `displayL` or larger. Everything else is support, and support goes in glass.
