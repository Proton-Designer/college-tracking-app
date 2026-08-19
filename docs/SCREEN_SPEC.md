# Screen Specification & Information Architecture

> Authored by the Lead. Defines every surface, its single job, its content, and its states — for
> **both platforms**. Every screen is built twice; this document is what keeps the two builds from
> becoming two products.
>
> **Rule:** behavior and information may never diverge between platforms. Layout, navigation
> idiom, and texture may.

---

## 0. Navigation model

**Web** — persistent left rail (collapsible), content max 1120px.
`Today · Courses · Calendar · Review · Insights · Settings`

**Mobile** — bottom tabs: `Today · Courses · Review · Insights`. Settings lives in the Today
header. Calendar is a segment inside Courses rather than a fifth tab — five tabs is one too many
and Calendar is consulted, not lived in.

Route segments are **identical across platforms** wherever a screen exists on both.

| Route | Web | Mobile | Public |
|---|---|---|---|
| `/` | landing page | welcome screen | ✅ |
| `/login` `/signup` `/forgot` `/reset` `/auth/callback` | ✅ | ✅ | ✅ |
| `/today` | ✅ | ✅ (tab) | |
| `/courses` · `/courses/[id]` | ✅ | ✅ (tab) | |
| `/calendar` | ✅ | segment of Courses | |
| `/review` · `/review/[date]` | ✅ | ✅ (tab) | |
| `/insights` | ✅ | ✅ (tab) | |
| `/focus/[sessionId]` | ✅ | ✅ (full-screen modal) | |
| `/settings` | ✅ | ✅ (from header) | |

---

## 1. `/today` — the core screen

**Its job:** make tomorrow's behavior different from today's. Everything else is subordinate.

Three modes, decided by the engine, never by the user:
`normal` · `recovery` (Recovery Mode active) · `unplanned` (no morning check-in yet)

### Content order (top to bottom)

1. **The Day Trace** (DESIGN_SYSTEM §6.1) — the signature. Planned vs actual as a chart-recorder
   trace with a live cursor. Full width, ~96px tall on web, ~72px on mobile.
2. **Header line** — date, and a compact physiological readout: `Sleep 7h 19m · Recovery 68`.
   Numbers carry their baseline delta where one exists (`↓1.4 vs 30-day`). If WHOOP isn't
   connected, this row is absent — **not** a placeholder card advertising an integration.
3. **Top 3 MITs** — checkboxes with calibrated duration estimates. Each shows its course tag and,
   on demand, its ranking rationale. Completing one is a single tap with immediate optimistic
   feedback.
4. **Workload band** — Floor / Target / Stretch as a single compact control showing where today
   sits. Floor items are visually non-negotiable.
5. **Deadline radar** — next 5 obligations with days-remaining and risk band. Anything `high` or
   `critical` shows its top trace reason inline.
6. **Kill-list commitments** — today's active commitments, one tap to log an event.
7. **Focus session launcher** — `Start focus` with the pre-selected highest-value block.

### Mode variations

- **`unplanned`** — the morning check-in becomes the primary call to action; MITs render as
  *suggestions* with an `Accept all` affordance. Per the brief, most mornings should require only
  corrections.
- **`recovery`** — a distinct header states Recovery Mode is active **and lists the trigger
  reasons**. Only the Minimum Viable Day is shown; deferred items are collapsed under an explicit
  "Rolled forward (N)" disclosure. Nothing disappears silently.

### States
`loading` (skeleton mirroring the real geometry) · `empty` (first-ever day: what this screen will
show once set up, plus one action) · `error` (what failed, what to do) · `offline` (last-known data
with an explicit staleness timestamp — never silently stale).

---

## 2. Morning check-in

**~60 seconds. Pre-filled. Most mornings should require only corrections.**

Sequence: physiological summary (read-only) → energy 1–10 → mood 1–10 → Top 3 (pre-filled from
deterministic ranking, editable, `Accept all`) → completion-probability prediction → most likely
derailment (chips: phone · fatigue · avoidance · schedule · other) → kill-list commitments.

Web: single scrolling column, 560px. Mobile: one step per screen with a progress rule — a
seven-field wall on a phone gets abandoned.

**Never blocks the day.** Skipping is always available and is itself recorded as a signal
(it feeds Recovery Mode detection).

---

## 3. Night review

**Auto-populated. The user only adds what the system cannot know.**

Shown pre-filled: MITs completed, deep-work minutes, screen time, distraction minutes, workout,
kill-list results, sleep target status.

The user supplies: what went well, what went wrong, anything important — plus **structured failure
reasons** (the friction log) for anything incomplete, as one-tap chips: underestimated duration ·
didn't know next step · distracted · tired · schedule changed · avoided discomfort · higher
priority appeared · other.

Then: last night's prediction scored against today's actual.

Voice input is offered for the three free-text fields — speaking for sixty seconds is materially
easier than writing, and the brief flags this as high value.

---

## 4. `/courses` and `/courses/[id]`

**Index** — one row per course: code, risk band + score, current grade, target, next deadline.
Sorted by risk descending. A row is a dense readout, not a card.

**Detail** — the Semester Map:
- Header: current grade, projected grade, target, confidence
- **Risk panel with the full explanation trace** — the "Why:" list, rendered from the engine's
  factor contributions. This is a *core* feature, not a debug view.
- **Grade scenario planner** — required scores on remaining items to reach target; supports
  hypotheticals (`If Exam 3 = 85 → final needed for an A = 96`). Shows `impossible` / `secured` /
  `final` verdicts plainly.
- Assignments & exams with weights, due dates, backplans
- Policies: late, attendance, grade boundaries
- Office hours — surfaced contextually when the user has flagged a topic confusing repeatedly
- **Weight-sum warning** when categories don't total 100. Never silently normalized.

---

## 5. `/calendar` — deadline radar

Not a month grid. A **horizon**: obligations ordered by time, each with its backplan milestone
chain expanded inline. Compressed backplans are flagged; `infeasible` ones are unmissable.

Shows committed calendar time against available capacity so schedule congestion is visible rather
than inferred.

---

## 6. `/review` and `/review/[date]`

History plus the nightly report. The report is the **one place the product speaks in prose** — set
in Plex Serif at `body-l` on a 720px measure, visually distinct from the instrument chrome.

Structure: headline → objective summary → wins / failures (with evidence) → planning errors →
behavior patterns → academic risks → the lenses (Executive Coach, Academic Strategist, Behavior
Analyst, **Skeptic**, Systems Engineer) → tomorrow's changes (max 3) → `data_gaps`.

Every claim renders its cited evidence. **A claim without evidence is not displayed** — that is
the UI's half of the honesty contract.

If analysis is unavailable, show the deterministic report (numbers, traces, bands) plus an honest
note. Never a broken or empty report.

---

## 7. `/insights`

Grouped strictly by confidence tier, in this order, with the **line-style rule** from
DESIGN_SYSTEM §6.2: `High` (solid) · `Medium` (dashed) · `Testing` (dotted).

`Testing` items are phrased as **questions**, never findings, and each offers "Run an experiment"
— converting an observation into an N-of-1 trial with defined measures and a duration.

Active experiments show days elapsed, measures being tracked, and current direction — explicitly
labeled provisional until complete.

Also here: task-duration calibration table (the personal multipliers), friction cause distribution,
bounce-back scores with trend, planning-vs-execution quadrant.

---

## 8. `/focus/[sessionId]`

Full-screen, deliberately sparse. Target task, course, location, target output, elapsed time, and
the app-block list. One primary action.

On completion (five seconds): did you hit the target — yes / partly / no · actual output ·
subjective focus 1–5. Interruption count is captured passively where possible.

---

## 9. `/settings`

Profile & **timezone** (prominent — it defines every "day" in the product) · integrations
(WHOOP, Brightspace iCal, RescueTime, calendar) · notification preferences · kill-habit definitions
and implementation intentions · commitment escalation levels · LLM budget and current spend ·
**data export and deletion**.

Data export is not optional. This database holds someone's journals and academic record; they must
be able to take it and to destroy it.

---

## 10. Cross-cutting requirements

- **Every screen ships the full state matrix**: loading · empty · error · offline · and a
  realistic-content state. A screen that only looks right with perfect data is unfinished.
- **Empty states** say what the screen is for and offer one action. No illustrations, no cheer.
- **Optimistic updates** on every toggle/check, with rollback and a clear message on failure.
- **Numbers never appear without context** — a bare `68` is meaningless; `Recovery 68 · ↓12 vs
  30-day` is a fact.
- **Confidence is always visible** where the system is inferring rather than measuring.
- **Nothing the system defers or hides is silent.** Rolled-forward tasks, dropped backplan phases,
  and suppressed insights are all disclosed and countable.
- Keyboard reachable on web; ≥44px hit targets on mobile; `prefers-reduced-motion` honored.
