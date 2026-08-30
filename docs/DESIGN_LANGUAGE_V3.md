# Ihsan Design Language — v3

> **Supersedes `DESIGN_LANGUAGE_V2.md` ("Aurora") as the visual authority.** Aurora's *structural*
> rules survive; its surface does not. `DESIGN_SYSTEM.md` (v1, "Instrument") remains superseded.
>
> Every value here is transcribed into `packages/design/src/tokens.ts`,
> `packages/design/src/tailwind.css`, and re-exported by `packages/design/src/native.ts`. **Those
> three files must never drift.** Do not hand-tune a value in one of them.

---

## 0. Why this exists

The merge directive rules that **LifeOS's UI is the design base, not just its colour system** — the
left sidebar, the card-grid density, the dark theme, the domain colour coding, the section headers,
the page composition. Our surfaces get restyled to match rather than the reverse.

What does *not* change: CollegeOS's **interaction language**. Rituals with contracts, one-tap
ceremonies, honest empty states, no-guilt copy, refusals that explain themselves. The visual grammar
is Ayman's; the behaviour is ours. When they appear to conflict, the behaviour wins — a prettier
screen that fabricates a number is a worse screen.

---

## 1. Palette

Dark, deliberately and only. There is no light palette and no `prefers-color-scheme` branch. One
theme executed well beats two executed adequately, and this is a night-and-early-morning tool. A
light theme, if ever wanted, is a second token set behind the same interface — never overrides
sprinkled through components.

```
ground          #0A0A0C   near-black, faintly cool -- everything sits on this
surface         #131316   cards, panels, the sidebar
surfaceSunken   #1C1C20   wells, inputs, inset rows (a step UP in lightness: that is how
                          recession reads on dark)
ink             #F2EFEC   warm off-white. Never pure #FFF -- it glares at 2am
inkMuted        #9A9AA2
inkFaint        #6A6A72   never body text (see §1.1)
hairline        rgba(255,255,255,0.10)
border          rgba(255,255,255,0.16)
```

### 1.1 The accent, and why it moved

```
accent        #8FA0FF   periwinkle
accentHover   #A9B6FF
accentWash    rgba(143,160,255,0.14)
accentOn      #0A0A0C   the label colour ON a saturated fill
```

`color.accent` is used as **text** in around twenty places across both apps, so on a dark ground it
has to clear 4.5:1 as type — which the saturated indigo v2 used does not. The light periwinkle
clears ~8:1.

That inverts the label on saturated fills. White on the accent, or on risk-critical, lands near
3.7:1 and **fails**; near-black clears 5:1 on both. So primary and destructive buttons, chips,
segmented controls and the Island's active pill all take `accentOn`. Aurora's ruling still holds —
*a decision is not a translucent surface*, and a commit button stays opaque and final. It simply
carries dark type here.

### 1.2 Risk bands

Restated for a dark ground; semantics and ordering unchanged, so every existing consumer keeps
working. Washes are alpha rather than opaque tints, so they compose over any surface tier.

```
low       #3FBF8F    moderate  #E8B33C    high  #F0894B    critical  #E85050
```

### 1.3 Domain colour — the load-bearing idea

```
deen #E0A030 · business #4CAF7D · school #6AA9FF · fitness #9085E9 · work #D55181
```

Taken from LifeOS **verbatim**. Re-picking the hues would have thrown away the recognition his app
already built in the people who will use this one.

**Domain colour is information, never decoration.** An Hour on the Wall glows the domain it served.
The Signal ring segments by domain. A nav item tints by destination. Do not apply one because a
surface looks plain.

Charts use a **separate, darker, CVD-validated set** (`chartSeries`), because five series in one
donut cannot rely on position to be told apart:

```
deen #C98500 · business #199E70 · school #3987E5 · fitness #9085E9 · work #D55181
noise #E66767 · other #6A6A72
```

`noise` and `other` are chart-only. They are not domains and must never appear in a domain picker.

### 1.4 Atmosphere

Aurora's four pastel stops are gone. In their place: one low, warm **oxblood radial wash**
(`#2B0E13`) anchored top-left, fixed behind the page — enough to keep a near-black screen from
reading as a terminal.

`auroraForRisk()` survives with the same contract, including the rule that matters: **`null` is a
first-class value.** An account with no computed risk gets no atmosphere at all. The glow is an
instrument reading, not mood lighting. Never call it with a fabricated band to make a screen look
alive.

---

## 2. Surfaces

Three tiers. **Only these three.** A fourth is someone inventing a value.

| Tier | Fill | Fallback | Use |
|---|---|---|---|
| `glass` | `rgba(19,19,22,0.88)` | `#131316` | cards, panels, list containers |
| `glassRaised` | `rgba(28,28,32,0.94)` | `#1C1C20` | modals, sheets, popovers |
| `glassSunken` | `rgba(10,10,12,0.60)` | `#0F0F12` | wells, inset rows, empty states |

The non-blur fallback stays **mandatory**: `backdrop-filter` fails on older Android WebViews and
under reduced-transparency settings, and a surface that degrades to unreadable is a bug rather than
a degradation. On dark the fallbacks are near-opaque — which is also what LifeOS ships, where panels
are solid with a hairline and blur is a refinement rather than the mechanism.

Both edges invert from v2: highlight `rgba(255,255,255,0.06)`, hairline `rgba(255,255,255,0.10)`. A
dark outline on a dark ground is invisible.

**Elevation is nearly retired.** A drop shadow under a `#131316` card on a `#0A0A0C` page cannot be
seen. Hierarchy comes from border and tint. Shadows are reserved for things that genuinely float:
modals and the dock.

⚠️ Aurora's stacking warnings still apply verbatim — `backdrop-filter` promotes an element to its
own stacking context, and RN-web's `<input>` is statically positioned. Anything that overlaps,
floats, or stacks is suspect while converting a surface. Suspect stacking before colour.

---

## 3. Type

**Geist** (display + UI) and **Geist Mono** (data, eyebrows, and every number).

Numbers are always mono with `tabular-nums`. This is half of why LifeOS's data surfaces read calm:
columns of digits stop shifting as they update. There is no serif face; `fontFamily.serif` exists
only so a straggler renders as Geist rather than falling back to Georgia.

The 11-step ramp is unchanged from v2 (`displayXl` 52 → `caption` 12). The faces changed; the scale
did not.

---

## 4. Layout grammar

From LifeOS, and it is the part the directive is most explicit about.

- **Page = a big title, then sectioned panels.** `rounded-2xl`, 1px border, no shadow.
- **Three tile tiers**: a KPI card (accent-tinted), a panel with a hero value and a delta pill, and
  a stat tile with a baseline footnote.
- **"Before you started tracking"** rather than `0` for any window predating
  `profiles.tracking_started_on`. This is `packages/core`'s real-zero-is-not-absent rule surfaced in
  the UI, and it is what keeps a first-run dashboard honest instead of discouraging.
- **Sun–Sat strips** for anything weekly (classes, sets, shifts).
- **Consistency heatmaps** for anything daily over a month.
- **Quiet empty states**: an icon, one sentence, one call to action. Never filler, never a zero.

### 4.1 Navigation

Web and mobile carry the same information architecture; the sidebar is that architecture *unfolded*.

```
Web (lg: 72px icon rail · xl: 248px expanded)      Mobile (the Island dock)
  MAIN     Today · Learn · Self                      Today · Learn · Life · Self · Review
  LIFE     Deen · Business · School · Fitness · Work  with + Capture as the raised centre
  REVIEW   Review
  SYSTEM   Settings · + Capture
```

A phone can show five destinations, so five tabs are the whole IA there and `Life` is a hub screen.
A 1440px screen can show the domains too, and hiding them behind a hub on a screen with room is a
phone constraint imported into a desktop.

**Navigation grows as pillars ship.** An entry appears on the day its destination becomes real. A
nav item that opens a "coming soon" page is scaffolding wearing an honest empty state's clothes
(D40).

---

## 5. What we contribute — the interaction language

Non-negotiable, and the reason this is not simply a reskin.

- **Rituals with contracts.** An Hour cannot start without a one-line deliverable. The friction is
  five seconds of typing, and it is what makes the record falsifiable.
- **One-tap ceremonies.** Log a prayer, vote for a habit, +1 a distraction, clear a card. One tap,
  reversible, no dialog.
- **Honest empty states.** No location set means "Set your location in Settings" — never 5:00 AM.
  No dimensions means an explanation of what a dimension is for — never a 0% ring. See D40.
- **No-guilt copy.** A missed prayer is stated plainly and paired with the way back (qada). A
  neglected dimension fades; it never resets. Nothing scolds.
- **Refusals that explain themselves.** "Only deep sessions count as Hours — start a Learn session
  instead; it still lands on the Wall and in your day's coverage." The refusal names the rule and
  the alternative, in one sentence.

---

## 6. Accessibility

- Contrast is checked on each app's own `/design` route, against the worst real surface.
- `inkFaint` clears 3:1 for large text and non-text graphics and **does not** clear 4.5:1, by
  design. Legitimate uses: de-emphasised fractions of a metric, ghost lanes, disabled controls
  (WCAG-exempt), the "other" chart series. Never body text.
- **Nothing carries meaning by colour alone.** The prayer heatmap pairs each status with a legend
  and a per-cell label; domain colour is always accompanied by a name or an icon.
- Focus: 2px accent at 2px offset on everything interactive. The one ruled exception is the Island's
  active pill, whose own fill *is* the accent — it uses `island-ink` instead. Scoped to that case;
  do not generalise it.
- `prefers-reduced-transparency` removes blur entirely. It is an accessibility setting, not a
  preference to style around.
- `prefers-reduced-motion` disables the modal entrance and the Day Ribbon draw-in.
