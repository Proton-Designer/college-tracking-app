# L13 — Design Elevation

> Authored by the Lead, 2026-08-22, after reviewing the running app at 1440×900 against the demo
> account. Every observation below is from a live screenshot, not from reading code.
>
> **The direction is to deepen "Instrument", not replace it.** `docs/DESIGN_SYSTEM.md` stands.
> The visual language is good; it is applied too thinly.

---

## What is already working — do not "fix" these

Said plainly so nobody rewrites the best parts of the product:

- **The landing page is genuinely strong.** Editorial, confident, and specifically *not* the
  centered-hero/three-feature-cards shape that reads as machine-made. The Day Trace demo above the
  fold is the single best thing in the product.
- **Courses is clean and information-dense.** Real data, correct risk pills, good type hierarchy.
- **Insights is rich and honest.** The confidence-as-line-style system reads correctly, and empty
  states tell the truth (*"not enough recovered lapses yet"*, *"No review submitted yesterday to
  diagnose against"*) instead of showing a fabricated zero.
- **The serif/sans/mono split is doing real work.** Mono for anything measured is the right call and
  it's what stops the product looking like a generic dashboard.

---

## L13.0 — Primitives (in progress, Nova)

Depth without shadow-soup · motion is information · hierarchy before color · five states on every
interactive element · ≥44px touch targets. See the ratified direction in `L12_COMPLETION_PLAN.md`.

---

## L13.1 — Screen composition

These are the findings from live review. Ordered by how much they cost us.

### 1. Half the viewport is empty on the two most-used screens 🔴
At 1440×900, **Today** ends around y=570 and **Courses** around y=400. Everything below is bare
ground. It reads as a page that failed to finish loading.

This is a composition problem, not a "add more stuff" problem. Options in preference order:
constrain the content column and balance it (Today's Day Trace could earn far more vertical
presence), introduce a two-column arrangement at ≥1280px so secondary readouts sit beside primary
ones rather than under them, or give the page a deliberate full-height layout where the empty
region is *evidently intentional* rather than accidental.

**Do not solve this by inventing content.** Never fabricate a value applies to layout too.

### 2. No page header zone 🔴
Every screen is an `<h1>` followed immediately by content. There is nowhere for page-level actions
to live — which is precisely why "Add course" had nowhere to go. Atlas is about to need this on
`/courses`, `/courses/[id]` and `/deliverables/[id]`.

Define one **PageHeader** primitive: title, optional subtitle/context (date, term, range), and an
actions slot. Both platforms. This unblocks the entire data-entry track.

### 3. Rows don't look interactive 🟡
Course rows carry no affordance — no hover treatment, no chevron, nothing that says "this opens."
Nova already found the mobile counterpart: `CourseRow` was a bare `Pressable` with *zero* press
feedback. Same defect, both platforms.

### 4. Insights is one long undifferentiated scroll 🟡
Seven sections, inconsistently treated — `ACTIVE EXPERIMENTS` sits in a Panel, everything else is
bare. Either commit to sectioning or commit to not sectioning; the mix reads as unfinished. The
friction rows also cram `4 · 24% ↑ 23.5pp vs prior 30d` into an unaligned right edge — that's
measured data and it deserves column alignment and mono treatment.

### 5. Line length is unmanaged at desktop widths 🟡
Tables stretch the full content width at 1440. Long measure hurts scanning, and it's the main reason
the desktop app reads "wide and thin" rather than composed.

### 6. Sign out outranks navigation 🟢
In the nav rail, `Sign out` is a full bordered button pinned at the bottom while actual navigation
items are plain text. The least-used control is the most visually prominent one on the screen.

### 7. Landing: hero pins left, leaving a large right void 🟢
The hero text wraps around x≈890 in a 1440 viewport with nothing to its right, and the
*"THE REPORT SPEAKS"* section indents to a different left edge than every other section. Minor, but
it's the first thing anyone sees.

### 8. Calendar: the two densest components are data-dumped, not designed 🔴

**The backplan chain is an unparsable run-on.** A four-phase backplan currently renders as:

`check · 2026-08-21 · 21m stuck-review · 2026-08-21 · 29m attempt · 2026-08-21 · 72m understand · 2026-08-21 · 21m`

Fields inside a phase are separated by `·`, and phases are separated by… nothing. There is no way to
see where one phase ends and the next begins. This is the backplanning engine — one of the
product's best ideas — rendered as a log line. It needs real structure (a row or column per phase,
phase name / date / duration as distinct fields) and humanized dates instead of raw ISO.

**The capacity strip inverts the visual hierarchy.** Fourteen near-identical solid-teal bars
dominate the top of the page while carrying almost no information — the values range 12h15m–16h45m,
so every bar is within ~20% of every other and the chart reads as flat. The largest, most saturated
element on the screen is the least informative one.

Related labelling problem, **not** an engine bug (verified): the strip shows
`wakingMinutes - committedMinutes` under the heading **"AVAILABLE TIME"**, which reads as *"you have
16 hours to study on Saturday."* The engine is correct — weekly planning clips to real bounded
capacity via `clipIntervalsToCapacity`, not to raw waking time — but the label over-promises by a
factor of four. Either name it what it is (uncommitted waking time) or show it against real capacity.

### 9. `/calendar` has no view switcher 🟡
U6 (weekly planning) was ruled to live here as a "This week" view. There is currently no tab, no
segmented control, and no affordance of any kind for a second view on this route. Needed before U6
can land.

---

## L13.2 — Mobile

The user's original words were that mobile looked *"really primal barebones and unprofessional."*
Nova's diagnosis located it precisely and it was **not** color or type — those already use the token
system correctly. It was the absence of motion and press feedback: opacity-only presses, a Toggle
thumb that snapped with no animation, a Panel with no depth variants, tappable rows with no feedback
at all, and no reduced-motion handling anywhere in the app.

That is being fixed in L13.0. After it lands, mobile needs the same screen-composition pass as
above, plus a full on-device visual verification — which has never properly happened (see
`HANDOFF.md` §5.2).

---

## The bar

The product should look like a **precision instrument built by someone with taste** — closer to a
well-made piece of scientific software or a serious financial terminal than to a habit tracker.
Restraint, density, and hierarchy are the tools. If a screen reads flat, fix spacing and hierarchy
before reaching for color, and never reach for decoration.
