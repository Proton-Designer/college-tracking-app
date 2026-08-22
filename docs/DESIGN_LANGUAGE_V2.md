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

### 2.1 Which things are glass, and which are not

Ruled during the primitive pass. The test is **what the thing is**, not what tier is available:

- **An input is `glass-sunken` and takes no shadow.** A text field *is* the well material the tier
  table names. Recessed and floating at once contradicts itself.
- **A primary or destructive button is not glass.** It stays a solid saturated fill. **A decision is
  not a translucent surface** — the whole point of a commit button is that it is opaque and final.
  `secondary` is glass (a chip resting on the ground); `ghost` stays transparent.
- **A modal sheet is `glass-raised` at `radius.xl`**, grouped with the island at that radius, on
  `shadow-lifted`. Its backdrop derives from `ink`, never an unrelated hardcoded rgba.

### 2.2 Glass introduces layering where a flat UI had none

Two bugs, found independently on both platforms within an hour of each other, both caused by this
and neither presenting as a styling problem:

- `backdrop-filter` promotes an element to its own **stacking context**, so a glass panel later in
  DOM order painted over a fixed modal and swallowed clicks on its footer. Symptom: *"buttons don't
  respond."*
- RN-web's `<input>` is statically positioned, unlike `View`'s implicit `relative`, so it painted
  *behind* a sibling BlurView regardless of JSX order and had its own text blurred. Symptom:
  *"the placeholder looks blurry."*

**Anything that overlaps, floats, or stacks is suspect while converting a surface to glass.** If a
component looks subtly wrong, suspect stacking before colour. And if a third component needs the
same one-off `position`/`z-index` patch, that is the signal the structure is wrong — glass should
paint its blur and tint into a wrapper that content sits on top of, not as siblings that content
has to out-rank.

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
| `/deliverables/[id]` | **none — flat ground.** See below; this row originally said "that deliverable's `result.band`" and that was wrong. |
| `/review/[date]` | the band recorded **for that date**, never today's — a report is an archival record of a moment |
| `/calendar`, `/insights`, `/settings`, `/focus`, auth, landing | **none — flat ground** |

**Why `/deliverables/[id]` gets none.** `useDeliverableDetailData` computes no risk at all — it fetches
the deliverable, its course, its tasks and the backplan chain. Giving that screen a band would mean
adding a `computeRiskAssessment` call (course facts, grade projections, sleep baseline, timezone) to
a leaf screen **purely to tint a background**. The Aurora is explicitly ambient and carries no
information a user must read, so paying a real fetch for it is the wrong trade — especially with
`HANDOFF.md` §7.5 open, where `/today`'s round-trip count is already a known problem against cloud
RTT and invisible only locally.

The tempting middle option — computing a cheaper per-deliverable band from data the hook already
holds — is the one to refuse. It would create a **second definition of risk**, computed differently
from `computeRiskAssessment`. That is exactly what D16's core-mirror guard exists to prevent, and
this repo has already been bitten twice by the same shape (B1/B2 going stale in the hand-ported Deno
copy; B8's untracked query duplication). Two places answering "how risky is this?" will disagree
eventually, and the one on the prettier screen will be the wrong one.

**Constraints:**
- Derived from an existing computed value. **Never a new number, never a fabricated one.**
- **Never worth a new query.** If a screen would need one to know its band, that screen gets flat
  ground. Atmosphere does not justify I/O.
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
- Contrast: body text must clear **4.5:1** measured against the **worst real surface**, which is
  `glass-sunken` composited over the lightest aurora stop — `rgba(255,255,255,0.38)` over `#FFD3E4`
  = **`#FFE4EE`**. Not against white, and not against the raw aurora either: text sits on a glass
  panel *over* the field, so both of those measure the wrong thing. Verify with a real
  contrast check, never by eye.

### 7.1 Measured, not estimated

Computed during the primitive pass after ATLAS put real WCAG ratios on `/design` and two tokens
failed. Kept here because the numbers are the evidence:

| Token | Was | Now | On its own wash, at `RiskPill`'s 11px |
|---|---|---|---|
| `riskLow` | `#1F7A5C` | `#1F785B` | 4.67 → **4.79** |
| `riskModerate` | `#B07A0A` | `#8E6208` | **3.31 (FAIL)** → **4.79** |
| `riskHigh` | `#D2601F` | `#AC4F19` | **3.41 (FAIL)** → **4.76** |
| `riskCritical` | — | `#C42B2B` | 4.84, unchanged |
| `accent` | — | `#3A56F0` | 4.67 on the worst glass, unchanged |
| `inkFaint` | `#8E95A8` | `#818798` | 2.51 → 3.00 (large-text/non-text bar only) |

The measurement that mattered was **foreground on its own wash**, not foreground on white. A
`RiskPill` never renders on white — it renders on `riskModerateWash`, which is lighter than the
aurora and darker than the panel. Checking against white would have passed two colours that fail
where they actually appear.

---

## 8. Migration rule

Do not port v1 component-by-component into new colours. Every screen gets its **composition**
reconsidered — the user called out "dimensions and component placement" specifically, and a
re-skinned bad layout is still a bad layout.

The order for each screen: what is the one thing this screen exists to tell the user? Lead with
that at `displayL` or larger. Everything else is support, and support goes in glass.
