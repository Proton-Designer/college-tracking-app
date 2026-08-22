# CollegeOS Design System — **"Instrument"** (v1, superseded)

> ## ⚠️ SUPERSEDED — read `docs/DESIGN_LANGUAGE_V2.md` instead
>
> **The visual authority is now `docs/DESIGN_LANGUAGE_V2.md` ("Aurora"), ratified 2026-08-22.**
> v1's surface — cream ground, IBM Plex Serif display, hairline boxes, 3/5/8 radii, text-only
> tab bar — was rejected by the user as *"primal and barebones."*
>
> This file is kept because its **structural** rules survived the revamp and are still binding:
> the thesis in §1, the "never fabricate a value" rule, the empty-state discipline, the
> platform-parity rule (behaviour and information may not diverge; layout and idiom may), and the
> contrast methodology. **Everything about colour, type, radius, elevation and texture below is
> historical.** Do not implement from it.

---

## 1. Thesis

CollegeOS is not a productivity app and must not look like one. It is a **measurement instrument
pointed at a person's semester** — it records baselines, detects deviation, labels its own
confidence, and argues with its user when the evidence disagrees with them.

So the design language comes from the subject's own world: **biomedical instrumentation**.
Calibrated paper. Chart-recorder traces. Panel labels. Tabular readouts. Solid lines for what was
measured, dashed for what was inferred. The interface's job is to make a life legible the way an
instrument makes a signal legible — with precision, without drama, and never by flattering the
reader.

This gives us a rule that resolves most design questions on its own:

> **The interface measures. The report speaks.**
> Chrome is quiet, dense, and typographically neutral. The nightly analysis is the one place the
> product uses a human voice, and it gets its own typeface to prove it.

### Why not the obvious alternative
The default direction for a "serious personal app" right now is cream paper, a high-contrast
display serif, and a terracotta accent. It is a competent look and it is **the same look every
similar product is currently wearing** — it would say nothing about this product. "Instrument" is
chosen because it is *true to the subject*: this app's actual personality is its epistemics, and
instrumentation is the visual grammar of epistemics.

---

## 2. Color

Deliberately restrained. Nearly the whole interface is paper, ink, and hairline. Color appears
almost exclusively to encode **risk** and **confidence** — never for decoration.

### Foundation

| Token | Hex | Role |
|---|---|---|
| `ground` | `#FAFAF8` | page background — the measurement surface |
| `surface` | `#FFFFFF` | readout panels sitting on the ground |
| `surface-sunken` | `#F2F2EF` | wells, inputs at rest, inactive tracks |
| `ink` | `#16181D` | primary text — near-black, faintly cool |
| `ink-muted` | `#5C6270` | secondary text, labels |
| `ink-faint` | `#8A8E85` | tertiary, placeholder |
| `hairline` | `#E3E4E0` | decorative separation only |
| `border` | `#7D8178` | **interactive** borders (inputs, controls) |
| `accent` | `#0B5D66` | deep instrument teal — user agency only |
| `accent-hover` | `#094A52` | |
| `accent-wash` | `#E8F1F1` | selected/active backgrounds |

> **The ground is darker than the panels.** This inverts the usual "white cards on grey." Here the
> tinted ground reads as the calibrated surface and white panels read as readouts placed on it.

### Semantic — risk scale

Monotonically darkening toward severity, so it survives greyscale and colorblindness. **Always
paired with the band name in text** — color is never the only carrier.

| Band | Hex | On white | Wash |
|---|---|---|---|
| `risk-low` | `#3F7D5C` | 4.88 AA | `#EDF4F0` |
| `risk-moderate` | `#8A6516` | 5.31 AA | `#F7F1E3` |
| `risk-high` | `#B4501A` | 5.12 AA | `#FBEEE6` |
| `risk-critical` | `#A8231F` | 7.18 AAA | `#FAEBEA` |

### Verified contrast

| Pair | Ratio | Level |
|---|---|---|
| `ink` on `ground` | **16.99** | AAA |
| `ink-muted` on `ground` | **5.85** | AA |
| `accent` on `ground` | **7.25** | AAA |
| white on `accent` | **7.58** | AAA |
| `border` on `ground` | **3.80** | AA (non-text 1.4.11) |

### The accent rule
`accent` is reserved for **the user's own agency** — primary actions, focus rings, the live trace,
selected state. It never marks severity, and severity colors never mark actions. A cool accent was
chosen specifically so the entire warm range stays free for the risk scale without collision.

---

## 3. Typography

One superfamily, three voices, each with a **semantic job**. This is a role assignment, not a
pairing of tastes.

| Voice | Family | Job |
|---|---|---|
| **Display** | `IBM Plex Serif` | The report's voice. Nightly analysis headlines, landing hero, section titles. |
| **UI** | `IBM Plex Sans` | Everything the interface says. Labels, buttons, body, forms. |
| **Data** | `IBM Plex Mono` | Every number, every panel label, every timestamp. Tabular figures always. |

Plex Serif is low-contrast and sturdy — it reads *technical manual*, not fashion magazine, which is
why it is used here rather than a Didone. All three are on Google Fonts.

### Scale

| Step | Size / LH | Family | Tracking | Use |
|---|---|---|---|---|
| `display-xl` | 56 / 60 | Serif 600 | −0.02em | landing hero |
| `display-l` | 40 / 44 | Serif 600 | −0.02em | report headline |
| `display-m` | 28 / 34 | Serif 600 | −0.01em | screen title |
| `title` | 20 / 28 | Sans 600 | −0.01em | panel title |
| `body-l` | 17 / 26 | Sans 400 | 0 | report prose |
| `body` | 15 / 22 | Sans 400 | 0 | default |
| `body-s` | 13 / 19 | Sans 400 | 0 | secondary |
| `label` | 11 / 14 | **Mono 500** | **+0.10em**, uppercase | panel labels — the instrument idiom |
| `metric-xl` | 44 / 48 | Mono 500 | −0.01em | hero number |
| `metric` | 22 / 26 | Mono 500 | 0 | readout number |
| `caption` | 12 / 16 | Mono 400 | +0.02em | units, timestamps |

**Numerals use `font-variant-numeric: tabular-nums` everywhere, without exception.** Numbers that
shift horizontally as they update are the single clearest sign an interface is not an instrument.

---

## 4. Space, form, elevation

- **Space scale (px):** 2 · 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 56 · 80. 4px base grid.
- **Radius:** `sm 3` · `md 5` · `lg 8` · `pill 999`. Deliberately tight — instruments have small
  radii. **No `rounded-3xl` anywhere.**
- **Borders:** hairline `1px`. On mobile use `StyleSheet.hairlineWidth`.
- **Elevation: hairlines and tonal shifts do the work, not shadows.** Only two shadows exist, both
  for genuinely floating layers:
  - `overlay`: `0 1px 2px rgba(22,24,29,.04), 0 8px 24px rgba(22,24,29,.08)`
  - `popover`: `0 1px 2px rgba(22,24,29,.06), 0 4px 12px rgba(22,24,29,.10)`
  Cards, panels, and list rows get **no shadow**. Ever.
- **Content width:** 1120px max for app surfaces, 720px for report prose.

---

## 5. Motion

Fast, physical, purposeful. Motion confirms a change; it never announces itself.

| Token | Value | Use |
|---|---|---|
| `instant` | 90ms | state flips (checkbox, toggle) |
| `quick` | 150ms | hover, focus, small reveals |
| `base` | 220ms | panels, sheets, tab changes |
| `deliberate` | 380ms | the trace draw-in only |

- Web easing: `cubic-bezier(0.2, 0, 0, 1)` (decelerate) · `cubic-bezier(0.4, 0, 1, 1)` (exit).
- Native springs: standard `{damping: 22, stiffness: 240, mass: 1}`; sheets `{damping: 26, stiffness: 190}`.
- **`prefers-reduced-motion` is honored everywhere.** The trace renders instantly at full extent
  rather than drawing; nothing else transitions.
- Forbidden: looping ambient animation, parallax, decorative gradient movement, anything on scroll
  that isn't a genuine reveal.

---

## 6. Signature elements

Three, and they are the only places the design spends boldness.

### 6.1 The Day Trace — *the signature*
A full-width band at the top of Today rendering the day as a **chart-recorder trace**:
- a light ghost line for the **planned** day (blocks, classes, intended focus)
- a solid `accent` line for **actual** execution
- shaded deviation where they diverge
- a live cursor at the current time

It draws in left-to-right on load (`deliberate`, 380ms), the way a pen recorder writes. This is the
product's whole thesis — planned versus actual — made into one glanceable object, and it is the
thing a user will remember. Nothing else on the screen may compete with it.

### 6.2 Confidence as line style
Insight cards carry a 2px left rule whose **style encodes epistemic status**, borrowed directly
from how charts distinguish measured from interpolated data:

| Tier | Rule | Meaning |
|---|---|---|
| High | solid | measured |
| Medium | dashed | indicated |
| Testing | dotted | hypothesis |

This makes the confidence hierarchy visible before a word is read, and it enforces the product's
core honesty rule at the level of visual grammar.

**Ratified as a system-wide convention** (extended from insights during L4): this encoding applies
to *any* value the system infers rather than measures — insight tiers, task-duration calibration
confidence, risk scores with missing factors, provisional grade categories. Wherever the product
shows a number it is less than certain about, the line style carries that uncertainty.

The mapping is always the same, because the epistemics are always the same:
`solid = measured · dashed = indicated · dotted = hypothesis`.

A user should be able to learn this once and read it everywhere. Do not invent a second uncertainty
encoding (opacity, italics, a badge) for a different surface — one grammar, applied consistently.

### 6.3 Calibrated ground
The `ground` carries an extremely faint 8px grid (≈0.7% opacity ink — tuned down from an initial
1.5% pass, which read as visible graph-paper wallpaper rather than a felt texture), like
engineering paper. It must be *barely* perceptible — felt, not seen. It disappears entirely under
`surface` panels.

**Platform divergence (deliberate, accepted):** web renders the grid via a CSS background-image;
mobile ships `ground` as a flat color with no grid. At ≈0.7% opacity the texture is already
sub-perceptual on a desktop display, and on a phone at normal viewing distance it would be
effectively invisible regardless — so the cost of a new dependency (`react-native-svg`) or a
tiling image asset to reproduce it isn't justified by anything a user could actually see. This is
a considered platform adaptation, not a gap: **behavior and information must never diverge between
web and mobile; texture may, when the divergence is provably imperceptible.** Revisit only if L11
polish review finds mobile reading noticeably flatter than web side-by-side.

---

## 7. Component rules

All components ship the full state matrix: **default · hover · focus-visible · active · disabled ·
loading · error**. A component missing a state is unfinished.

- **Focus ring:** `2px solid accent`, `2px` offset. Never removed, never `outline: none` without an
  equivalent. Must be visible on every interactive element via keyboard.
- **Hit targets:** ≥44×44px on mobile, ≥32px on desktop pointer.
- **Buttons:** `primary` (accent fill, white text) · `secondary` (surface + `border`) · `ghost`
  (text only) · `destructive` (`risk-critical`). One primary per view.
- **Inputs:** `surface-sunken` fill, `border` hairline, `accent` on focus. Error state uses
  `risk-critical` border **plus** a text message — color alone is never the error.
- **1–10 scales** (energy, mood): a segmented control of 10 discrete cells, not a continuous slider.
  Discrete values deserve discrete controls, and it makes the tap target honest.
- **Empty states** state what the screen is for and give one action. Never an illustration, never a
  cheerful line.
- **Skeletons** mirror the real layout's geometry. No spinners except for genuinely indeterminate
  waits > 400ms.

---

## 8. What this system forbids

Explicitly, so it cannot drift back toward the default:

- Purple/indigo→blue gradients. Glassmorphism. Any decorative gradient.
- Emoji anywhere in the UI chrome, in labels, or in headings.
- Drop shadows on cards, panels, or rows.
- `rounded-2xl`/`rounded-3xl`.
- Sparkles, confetti, streak flames, badges, trophies, or any gamification ornament — the product
  explicitly measures **bounce-back rather than streaks**, and the visuals must not smuggle back in
  the psychology the product is designed to reject.
- Motivational filler copy. Exclamation marks in system voice.
- Centered marketing-style body text inside the app.
- Pure `#FFFFFF` as the page background.
- Proportional figures in any number.
- Color as the sole carrier of meaning, anywhere.

---

## 9. Voice

Plain, direct, specific. Sentence case. Active voice. The interface names things the way the user
thinks about them.

- Actions keep the same word through the flow: a button that says **Start focus** produces
  **Focus started**.
- Errors say what happened and what to do. They do not apologize and are never vague.
- Empty states are invitations to act, not moods.
- The system never praises without citing a specific thing that happened. *"You finished both
  academic MITs despite starting below target energy"* — never *"Great job!"*
- Numbers are always given their unit and, where it matters, their baseline: *"6.3 h · −1.4 vs 30-day
  average."*
