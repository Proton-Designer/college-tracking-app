# Blueprint Implementation Plan

> Companion to `docs/BLUEPRINT_RECONCILIATION.md`, which classifies every blueprint feature against
> HEAD and lists the collision rulings this plan assumes. Phase order follows the blueprint's
> Part IX, **adjusted for what already exists** — several phases shrink substantially because the
> Academics module and the integration layer are largely built. Nothing here is started.
> **Awaiting approval.**

---

## Before Phase 1 starts

**Rulings: settled 2026-08-24.** All nine are recorded in the reconciliation report; the ones that
shape this phase are C1 (extend `task_sessions`), C3 (MIT-setting moves to the Night Plan, morning
check-in slimmed rather than deleted), **C8 (no Chain — see D23)**, and Hours-as-user-facing-unit.

**One gate remains: verify local scheduled notifications in Expo Go on a real device.** ~10 minutes.
`expo-notifications` ships in SDK 54's Expo Go, but Expo has narrowed Expo Go's notification support
repeatedly, and **two of Phase 1's rituals depend on it** — the Hour-end alert at 60:00 and the
9:30 PM Night Plan anchor, which Part VII calls the single highest-leverage retention choice in the
design. The specific capability at risk is a **repeating daily calendar trigger**, not a one-shot
timer. If it doesn't work, that changes Phase 1's design, not its polish.

**Status: pending. Phase 1 is not committed until this returns green.**

---

## Phase 1 — the Work Engine spine

**Scope (as set, adjusted by D23):** Hour timer + distraction counter + End-of-Hour flow · Night
Plan (dump/star/crown) · Start Day + delta clock · **Day Won + bounce-back** (no Chain) · the Wall ·
slimmed morning check-in (C3).

**Expo Go:** ✅ entirely. No dev build. **Credentials:** none.
**Adjustment from the blueprint:** the timer substrate already exists (`task_sessions`), so this
phase is mostly *extending* a proven table and building UI, not designing persistence from scratch.

### 1.1 Schema (one migration, `…34_work_engine.sql`)
- Extend `task_sessions` per **C1**: `hour_index smallint`, `deliverable text`, `category text`,
  and relax `task_id` to nullable so an Hour can exist without a task row. Keep `status`,
  `interruptions`, and the one-active-per-user index untouched — they already do what's needed.
- New `distractions` child table per **C2**: `session_id`, `cause` enum
  (`phone|hard|finished_early|notification|reflex|bored`), `at timestamptz`. Counter column stays.
- New `days` table: `local_date`, `wake_at`, `sleep_intent_at`, `baseline_hours`, `hours_completed`,
  `day_won`. **No `chain_repair_used`** — D23. `local_date` computed at write time from the user's
  timezone — **never** from UTC (this is the B4 rule, and `days` is exactly where B4 would come
  back).
- RLS on both new tables: `auth.uid() = user_id`, `using` + `with check`, matching every existing
  policy. pgTAP coverage in the same commit.

### 1.2 `packages/core` (pure, dependency-free — it mirrors into Deno)
- `delta.ts` — wake → first completed Hour, in seconds. `null` when no Hour is complete, never `0`
  (the A2 null-vs-zero rule).
- `dayWon.ts` — `hours_completed >= baseline_hours` for that weekday.
- `efficiency.ts` — **held until the Night Plan chunk exists** (ruling 2026-08-24), then
  defined as **completed Hour time / time awake**, where wake is the Start Day tap, the
  denominator runs against `now()` while the day is live, and `sleep_intent_at` closes the
  day's final number. Recorded here because the denominator was genuinely ambiguous in the
  blueprint ("allowed time / time awake") and guessing it would have baked a wrong metric
  into the day surface.
- **No `chain.ts`** (D23). Recovery reuses the existing `packages/core/src/bounceback/` engine:
  time from a missed baseline back to a Day Won. Any new date math stays pure `LocalDate` string
  work via `addDays`/`compareLocalDate` — no `Date` arithmetic.
- `efficiency.ts` — allowed time ÷ time awake.
- Unit tests alongside each, in the existing style (DST, date-line and half-hour-offset cases for
  anything touching dates).
- Regenerate the Deno mirror; `check:core-mirror` must pass.

### 1.3 `packages/api`
`startHour` / `logDistraction` / `endHour` / `startDay` / `setSleepIntent` /
`saveNightPlan` / `listWall`. Thin data functions in the existing `data/*.ts` shape, returning
`DataResult`. Night Plan writes `tasks` + `mit_rank` through **`createTask`**, so a planned item is
indistinguishable from any other task.

### 1.4 UI — mobile first, then web
Mobile is where this product actually gets used, and it is the platform currently proven on device.
- Timer screen: full-screen, one giant **+1 Distraction** button → 6 cause chips → back in 2 taps.
  Resume from `actual_start` on mount (the mechanism migration 12 was built for).
- End-of-Hour: log → (cards deferred to Phase 2) → submit. Break timer auto-starts.
- Night Plan: 4-step card stack. Star 3 / crown 1 writes `mit_rank`.
- Start Day: one button; live delta clock.
- Wall grid (proof surface; only ever grows). Recovery surface shows bounce-back, not a streak.
- Slimmed morning check-in: confirm last night's MIT and start the day. Per C3 this replaces the
  MIT-*setting* step only — `submitMorningCheckin` shrinks rather than being removed.
- Web: the same surfaces, reusing existing components. Web is the secondary target this phase.

### 1.5 Definition of done
`npm run verify` exits 0 with new tests included · pgTAP covers the new RLS policies · a real Hour
completed end-to-end on a physical iPhone through Expo Go · the timer survives backgrounding and
app-kill · Day Won fires and is reflected on the day surface.

**Estimate: 6–9 days.** The timer and Night Plan are ~half; the Wall is mostly UI. Slightly
smaller than the pre-ruling estimate, since the Chain is no longer built.
Estimates throughout this document are estimates, not measurements.

---

## Decision: /day and /today merge in Tier 2 (ruled 2026-08-24)

Phase 1 left the app with **two answers to "what am I doing today"** — `/today`, the academic
day (MITs, risk, calendar), and `/day`, the Work Engine (Hours, Delta, baseline, Day Won).
That was acceptable while the Work Engine was being built; it is not a durable end state.

**The ruling:** they merge in Tier 2, with the **Work Engine surface as the base**.
Hours / Delta / baseline is the spine, and School Today plus the day's tasks feed *into* it
rather than living beside it. This follows the blueprint directly — Part II makes the Deep
Work Hour the spine of the app and Part V is explicit that the Academics module "stays
exactly as designed" as a planning brain feeding the same touchpoints, never a second
system. Part X's "no second daily ritual" says the same thing from the other side.

**Until the merge:** `/today` remains the default surface the app opens to, and `/day` stays
the second tab ("Hours"). **After the merge:** the merged surface becomes the default, and
post-login routing moves off `/today` with it.

**What this obliges Tier 2 to do.** School Today is not a new screen. It is a section of the
merged surface and a feed into the Night Plan's dump, exactly as Part V describes. Anything
built in Tier 2 that assumes a standalone academic Today is building toward a shape this
decision has already rejected — so build the feed, not the screen.

Recorded as **D24** in `.brain/memory/decisions.md`.

---

## Phase 2 — the thin layer around the engine, plus S1 (school, no AI)

**Expo Go:** ✅. **Credentials:** none — this is the point of S1.

**Core half:** Cards library + End-of-Hour rotation · Morning Routine checklist · Worry List +
Monday Hour 1 · Habits layer (**new `habits`/`habit_logs` per C6 — alongside `kill_habits`, never
merged**) · Night close-out stats.

**S1 half — and this is where the plan diverges most from the blueprint, because much of S1 exists:**

| Blueprint S1 item | Adjusted work |
|---|---|
| Courses, assessments, manual entry | **Mostly done.** `courses`, `deliverables`, `grade_categories`, `grade_items` all exist with UI. Work reduces to extending the `deliverable_type` enum with `quiz`/`post`/`admin` (**C4**). |
| Grade Ledger | **Done.** `courseGrade`/`requiredScore`/`scenario` + `grade_boundaries`, rendered on course detail. Verify against the blueprint's target-calculator wording; build nothing. |
| School Today → Night Plan feed | **Real work.** Emit an ordered per-course list for tomorrow and pre-populate the dump. `rankSuggestedMits` and `weekly_plan_blocks` supply the ranking and the placement. |
| School category on Hours | Small — the `category` column added in 1.1. |

**Estimate: 5–8 days**, down from the blueprint's implied scope because the Ledger and course model
are already built.

---

## Phase 3 — Insights, War Map, plus S2 (the parsers)

**Expo Go:** ✅. **Credentials:** 🔑 **`ANTHROPIC_API_KEY` required for the S2 half.**

**Core half:** weekly review screen (hours by category, distraction Pareto — which only works
because C2 stored causes), efficiency trend, War Map Lite (Top 5 Goals → monthly milestones),
per-weekday baselines, repair tokens.

**S2 half:**
- `parse_syllabus` — **already built** as `syllabus-extract` + `syllabus-confirm`, with a stronger
  guarantee than the blueprint specifies (server-side confirm is the only write path). Activating it
  is a **credential task, not a build task**: set the key and follow `SUPABASE_SETUP.md` §7,
  including its rule that if the live response shape differs from a golden fixture you **update the
  fixture from reality, never patch the test to pass**.
- `parse_announcement` — **the real new work**, and a near-clone of the syllabus pipeline:
  `announcements` table → staged diff → confirm → recompute. Reuse `syllabus-confirm`'s
  `confirmed | edited | rejected` vocabulary rather than inventing a second one.

**Estimate: 5–7 days**, of which `parse_announcement` is ~3.

---

## Phase 3.5 — S3: Question Bank, Modes, calibration

**Expo Go:** ✅. **Credentials:** optional — AI question drafting needs the key; self-authored
questions and the scheduler do not.

Entirely new: `questions`, `attempts`, `practice_tests`; SM-2-lite as a **pure function in
`packages/core`** (so it is testable and mirrors to Deno) with the nightly cron only assigning due
dates; Mode cards on the timer screen (**C5** — `mode` on the planned side); confidence taps
(Sure / Think so / Guessing) and the >15% illusion-of-competence rule.

⚠️ **Naming hazard:** `packages/core/src/calibration/` already means *duration* calibration. Do not
extend it. New concept, new module — e.g. `retrieval/confidence.ts`.

**Estimate: 6–9 days.** The largest genuinely-new academic surface.

---

## Phase 4 — the dev-build fork

**Expo Go: ❌ — this is the known fork.** Everything here needs a custom dev client, which also ends
`npx expo start` + Expo Go as the on-device loop and replaces it with EAS builds.

Push notifications (group pings, server morning nudge) · home-screen widget (**MIT + today's Hours
against baseline** — the blueprint specified Chain + MIT; D23 replaces the Chain half) ·
Live Activity timer · HealthKit steps/sleep · share cards · Sprint mode · numeric output metric
(`output_value`/`output_unit`).

**+ S4:** backward-planned exam retrieval curves, 3-week load forecasting, practice-test benchmark
rules, sleep↔score correlations.

**+ I2:** Whoop activation (**integration already built** — needs live OAuth credentials and webhook
secret, not new code) · App Intents · the two NFC tags · Focus-mode automation.

**Credentials:** 🔑 Whoop OAuth + webhook secret. Apple developer account for widget/Live Activity.

**Recommendation on sequencing:** take the dev-build fork **only when at least three Phase 4 items
are wanted at once.** It is a one-way door for the daily development loop, and the SDK 54 downgrade
we just completed exists specifically to keep Expo Go working. Do not spend that for one widget.

---

## Integrations, in the blueprint's own order

- **I1 (with Phase 3/S2)** — Canvas token poll + ICS reconciliation; Google Calendar read + write.
  🔑 **Canvas personal access token, Canvas ICS URL, Google OAuth client.** Note the ICS half is a
  near-clone of the working `brightspace-sync` → `ics_event_extractions` → `brightspace-confirm`
  pipeline; `oauth_connections.provider` needs `'canvas'` added to its CHECK. Store both Canvas
  credentials in **Vault** as bearer credentials, per the F3 ruling.
- **I2** — see Phase 4.
- **I3** — geofencing (dev build), morning brief + weekly narrative (🔑 `ANTHROPIC_API_KEY`; both
  slot onto the existing `nightly-analysis`/`weekly-synthesis` deterministic-first pattern, so they
  are enrichment on a working path, not new pipelines), Shortcuts distraction hack.
- **I4** — FamilyControls entitlement. Gated on Apple approval; blueprint correctly treats it as
  "only if earned".

---

## Where this plan deviates from the blueprint's Part IX, and why

1. **Phase 2's S1 and Phase 3's `parse_syllabus` shrink dramatically** — the course model, Grade
   Ledger, and syllabus pipeline already exist. Roughly a week of blueprint scope is already done.
2. **Whoop moves earlier in principle** (it is built, not pending) but stays in Phase 4/I2 because
   *activation* needs credentials and its main consumers — automatic Train and Sleep votes — need
   the Phase 2 habits layer to vote into.
3. **`rescuetime-sync` already exists** as the screen-time workaround the blueprint says is
   impossible via Apple. It should be surfaced in Phase 3's insights rather than rebuilt.
4. **The Wall is Phase 1**, as you scoped it, though the blueprint's own retention logic
   (Part VII, item 6: "proof compounds") argues it matters more after a few weeks of data. Building
   it now is right — retrofitting a proof surface onto historical data is harder.
5. **The Chain is not built at all (D23).** This is the single largest deliberate divergence from
   the blueprint. Day Won and the Wall are kept; consecutive-day counters and repair tokens are not.
   Bounce-back, which already exists, is the recovery metric.
6. **Multiplayer (Part IV-F) is absent from every phase above.** It changes the RLS model rather
   than extending it, and needs ruling **C9** plus the 🔴 L1–L4 security items closed first. The
   blueprint agrees. I've left it out entirely rather than sketch it.

---

## Cumulative estimate

| Phase | Estimate | Expo Go | Credentials |
|---|---|---|---|
| 1 — Work Engine spine | 6–9 days | ✅ | none |
| 2 — Thin layer + S1 | 5–8 days | ✅ | none |
| 3 — Insights + S2 | 5–7 days | ✅ | 🔑 Anthropic |
| 3.5 — S3 Bank + Modes | 6–9 days | ✅ | optional Anthropic |
| 4 — Dev-build fork + S4 + I2 | 10–15 days | ❌ **fork** | 🔑 Whoop, Apple |
| I1 — Canvas + Google Calendar | 4–6 days | ✅ | 🔑 Canvas token + ICS, Google OAuth |

**Phases 1 through 3.5 — the whole product minus the dev-build fork — is roughly 22–33 days of
work, entirely within Expo Go, and needs exactly one credential (`ANTHROPIC_API_KEY`) which is
already on the must-fix list as L4.**
