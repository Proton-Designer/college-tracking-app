# Deferred Items & Known Follow-ups

> Running list maintained by the Lead. Everything deliberately deferred, deferred-with-reason, or
> noticed-but-not-yet-fixed lands here so it is tracked rather than forgotten. Nothing is dropped
> silently — that's the same standard the product itself is held to.

**Status:** 🔴 must fix before launch · 🟡 should fix · 🟢 nice to have · ⚪️ scheduled to a later layer

---

## Scheduled to a later layer (not defects)

| # | Item | Layer | Notes |
|---|---|---|---|
| ⚪️ F1 | **Focus session launcher** omitted from Today | L6 | No write path exists. Deliberately *not* stubbed — a "Start focus" button that persists nothing is a fake feature. L6 builds start/stop, interruptions, subjective focus, objective output, proof-of-work, and `/focus/[sessionId]`. |
| ⚪️ F2 | **Kill-list section** omitted from Today | L6 | `kill_habits`/`kill_events` have no backend. Omitted rather than faked. |
| ⚪️ F3 | Brightspace `ics_url` stored plaintext | L10 | Ruled: it's a **bearer credential** (grants calendar access by possession, long-lived, not user-rotatable). Moves to Vault when the integration is built. |
| ⚪️ F4 | **L2 (distraction block) has no enforcement mechanism** | Settings | Real app-blocking needs native Screen Time / Digital Wellbeing APIs — out of scope for web and for managed Expo, and the brief itself scoped this to a later native-only feature. Found auditing `evaluateEscalations`: L2 currently produces the same in-app intervention message as L0/L1, nothing more. Settings' escalation-ceiling picker labels this explicitly rather than implying it works. |
| ⚪️ F5 | **`kill_habits` has no accountability-partner contact field** | Settings | L3 is meant to notify a real, named person. There is no column to store who, so L3 cannot notify anyone even in principle — a schema gap, not just a missing notification integration. Found the same audit pass as F4. Settings' escalation-ceiling picker labels L3 as in-app-message-only until this exists. |

---

## Scope gaps caught in audit (Lead's assignment errors)

| # | Item | Notes |
|---|---|---|
| 🔴 A1 | **Night review UI never assigned** | `MASTER_PLAN` L4 is "Today, morning check-in, **night review**, tasks." The L4 assignment specified Today + check-in and omitted the night review. `/review` exists on neither platform. This is the **Reflect** step of the closed loop — without it a user can plan a day but never close it, and friction logs, prediction scoring, calibration actuals, and **L7's nightly analysis all have no input**. Backend (`submitNightReview`) already exists. Queued to Nova after mobile Today. |

| 🔴 A2 | **Timeboxing / implementation intentions were never scoped** | The brief specifies a plan as an *implementation intention* — when, where, how (`BME exam prep · 4:30–5:45 PM · WALC library · Ch5 practice`) — and ties it to the research on specific plans outperforming vague ones. `tasks` carried only `planned_date` (a day, no time), so **start delay — a headline metric in the brief ("planned start 4:00 / actual start 5:07") — could not be measured at all.** Caught when Atlas honestly reported start delay as 0 and refused to invent a scheduling concept. Fixed in L6: `tasks.planned_start_at` + `planned_location`, start delay `null` (never 0) when unset. |
| ~~⚪️ A3~~ | ~~Weekly planning (the brief's Sunday session) not yet scoped~~ | **Backend resolved.** `buildWeeklyPlan`/`findFreeIntervals` (packages/core) + `generateAndPersistWeeklyPlan` (packages/api) + `weekly_plans`/`weekly_plan_blocks`/`weekly_plan_unplaced` schema. Deterministic: ranks deliverables by risk-reduction-per-minute (the same rule `rankSuggestedMits` already uses for Today's MITs, not a second definition of priority), places blocks into real free-time intervals bounded by the same recovery/historical-performance capacity ceiling Today's workload respects, reports unplaced work explicitly rather than dropping it silently. "Adjust once, carries forward": editing a block is a plain UPDATE, regeneration refuses to clobber an already-adjusted week unless forced. **Not yet built:** the LLM-phrased rationale line ("BME exam is 8 days out, highest risk this week") — deliberately scoped out, the plan is complete and correct without prose; UI wiring (Nova's domain, not yet started). |

**Process note:** caught by auditing built routes against `SCREEN_SPEC`, not by either engineer's
report — both engineers correctly built exactly what they were assigned. Layer scope must be
audited against the plan at each boundary, not assumed from assignment messages.

---

## Backend built, no UI — found by Lead audit (2026-08-19)

Five features have working, tested backends that **no screen reaches**. Same family as D20
(a component isn't done until a real caller invokes it) — here the missing caller is the UI.

| # | Feature | Why it matters | Where it belongs |
|---|---|---|---|
| 🔴 U1 | **Interventions never displayed** | L9 records every intended intervention with its trigger and outcome, and nothing shows them. **"Intervene" is a step of the product's core loop** — Observe → Plan → Execute → Detect deviation → *Intervene* → Reflect. Right now that step is invisible, so the loop is open. | Today (inline), plus a history surface |
| ~~🔴 U2~~ | ~~No way to set `planned_start_at`~~ | **Resolved — and this entry was stale.** The write path shipped in `8a852ba` (backend: optional per-MIT timebox in `submitMorningCheckin`) and `cf4bb70` (UI, both platforms), both ancestors of HEAD. `submitCheckin.ts` writes `planned_start_at`/`planned_location`; web `CheckinForm.tsx` and mobile `CheckinFlow.tsx` both carry optional per-MIT timebox fields defaulting to unset. **Caught by Atlas checking before building, and independently by the Lead's reachability audit — a stale FOLLOWUPS row nearly cost a rebuild of working code.** Standing lesson: this document is a claim, not evidence; re-verify a row against HEAD before acting on it. Still open (separate, smaller): mobile uses validated free-text `HH:MM` rather than a native picker. | Morning check-in |
| 🟡 U3 | **Proof-of-work unreachable** | L6 built submission + a server-side completion gate. No UI sets `requires_proof_of_work` or submits evidence, so an entire brief feature is dead. | Task detail / completion flow |
| ~~🟡 U4~~ | ~~`max_escalation_level` unsettable~~ | **Resolved.** Settings' kill-habit editor now lets a user set the ceiling per habit, all 5 levels selectable. Verified live via psql that the write reaches the DB. Found while building it: L2-L4 currently produce the same in-app-message-only behavior as L0/L1 (see F4/F5) — the picker labels this explicitly rather than implying real enforcement exists. | Settings — kill-habit definitions |
| ~~🟢 U5~~ | ~~Office hours never surfaced~~ | **Resolved (display half).** `course_office_hours` has carried real seeded data since the academic schema and **no function anywhere in the repo read or wrote it** — there was no API layer at all, not just no UI. Added `listCourseOfficeHours`/`createOfficeHour`/`deleteOfficeHour` and a reference display on course detail, both platforms. Verified live: *Tuesday 2:00 PM–4:00 PM · MSEE 340*. **Deliberately NOT built:** SCREEN_SPEC §4's *contextual* surfacing when a topic is repeatedly flagged confusing — "repeatedly" needs a real threshold, and inventing one would be the fabricated-constant failure this build spent its time removing. Waiting on a rule from the domain spec, not on effort. |

| 🔴 U6 | **Weekly planning has no UI at all** | The brief's Sunday session — capacity + deadlines + risk + unfinished work → suggested focus blocks, adjusted once and carried forward. Backend is *complete*: pure engine with free-interval math, schema (`weekly_plans`/`weekly_plan_blocks`/`weekly_plan_unplaced`), orchestration, cold-start fix, unplaced-work disclosure. **Nothing renders any of it.** Also a Lead spec gap — `SCREEN_SPEC` §0 never defined a route for it. **Ruling: it lives inside `/calendar`** as a distinct "This week" view rather than a seventh nav item; Calendar is already the horizon surface and five-plus-Settings is the right nav ceiling. |
| 🟡 U7 | **Decision journal has no UI** | L8 built log/score/list with the observe-then-score pattern. The brief wants decisions recorded with reasoning + prediction, scored later, so systematic decision errors surface over time. Belongs on `/insights` beside experiments — same "observe, then find out if you were right" shape. |
| 🟢 U8 | **Semester lessons have no UI — and currently nothing to show** | Confirmed 2026-08-22 against real data: the demo account has **0 semester_lessons rows**, because `semesterRetrospective` only promotes **high**-confidence insights and demo holds 4 medium + 3 testing. So the table is legitimately empty and a UI would render an empty state. Producer and consumer both exist and work (`semesterRetrospective` writes, `buildContext`'s `loadDurableProfile` reads) — earlier audits missed this because both use raw Deno queries rather than the `packages/api` helpers. Genuinely low priority until an insight reaches high confidence. |

**Note:** `grade_boundaries` looked like a gap in the same audit and is a **false positive** — it renders
on course detail. Grep for a column name finds absence of that *string*, not absence of the feature.

**Process note:** found by auditing backend columns/functions against UI references, not from any
report — both engineers built exactly what was assigned. This is the *third* scope gap caught by
audit rather than by review (after the night review and A2 timeboxing). Layer completion must be
audited against the plan and the schema, not inferred from assignments.

---

## 🔴🔴 E-SERIES — THE PRODUCT HAS NO DATA-ENTRY PATH (Lead audit, 2026-08-22)

> **This is the most serious gap found in the entire build, and it outranks every U-item.**
> Found by a reachability audit: every exported `packages/api` function checked for a caller in the
> real request path. Verified, not suspected.
>
> **A real user signs up and the app is permanently empty.** Risk scores, grade projection,
> backplans, MITs, weekly planning — the entire engine derives from courses, assignments, and tasks
> that *the user has no way to enter.*
>
> **Why it never surfaced:** every verification we ran passed because it ran against the **seeded
> demo account**. We were always reading a semester that had been inserted with SQL. Cold-start was
> tested for *empty states rendering honestly* — which they do — but never for "can this user
> actually put data in?" The empty state on web Courses reads *"No courses yet. Add one, or upload a
> syllabus to get started."* **Neither action exists.** It is an empty state advertising two buttons
> that were never built.
>
> This is also the brief's PRIMARY onboarding flow, and the surface where CLAUDE.md's third law
> ("extracted academic deadlines *always* require explicit user confirmation before they are
> persisted as real") is supposed to be enforced. That law currently has no UI to live in.

| # | Item | Evidence | Where it belongs |
|---|---|---|---|
| 🔴 E1 | **No course creation/edit UI** | `createCourse` has zero callers outside the barrel export. | `/courses` — create, edit, archive, incl. weight categories + grade boundaries (the grade engine needs them) |
| 🔴 E2 | **No task/assignment creation UI** | `createTask` has zero callers outside the barrel. | Course detail + Today; due date, weight, category, estimated minutes |
| 🔴 E3 | **No syllabus upload UI, and `syllabus-extract` has no caller anywhere in the repo** | `uploadSyllabus` zero callers; grep for `syllabus-extract` across `apps/`, `packages/`, `supabase/` returns nothing. | Course detail / onboarding — upload → extract → **explicit confirm** |
| 🔴 E4 | **Imported deadlines can never be confirmed** | `listPendingIcsEvents` has zero callers, so Brightspace ICS events sync into a pending state with no surface to confirm them. The integration cannot complete its loop. | Course detail or a dedicated confirmation surface |
| 🟡 E5 | **Backplans are never generated from the UI** | `generateAndPersistBackplan` has no app caller — backplans exist only if seeded. `BackplanChain` renders them but nothing creates them. | Course/assignment detail |

**Also noted:** neither app invokes a single edge function via `functions.invoke`. The only
app-reachable edge function is `account-delete`, via a server action. `nightly-analysis`,
`weekly-synthesis`, `whoop-webhook`, `whoop-oauth-callback` and `rescuetime-sync` having no client
caller is **correct** (cron- and provider-invoked). `syllabus-extract` having none is **not**.

**Process note — the fourth scope gap caught by audit rather than by review.** After the night
review (A1), timeboxing (A2), and U1–U8, this one was invisible for a different reason than the
others: it isn't a missing screen on a spec, it's a missing *verb* across the whole product. Nothing
in `SCREEN_SPEC` was violated, every assignment was built as written, and every test passed. The
lesson is that "all screens render correctly" and "a user can actually use this" are different
claims, and only the first one was ever tested. **A demo seed is a rendering fixture, not proof of
a usable product.**

---

## Found in live review, 2026-08-22 (Lead, demo account, web)

Found by actually using the app rather than reading it. All three verified in a live browser.

| # | Item | Evidence | Ruling |
|---|---|---|---|
| 🔴 U9 | **The experiment loop can be started but never finished** | `createExperiment` has callers (the "Run an experiment" button works). `logExperimentMeasurement`, `scoreExperiment` and `getExperimentOutcome` have **zero callers on either platform.** So a user can start an experiment and then has no way to record a single measurement or score the outcome. | This is the **Learn** step of the closed loop, and it is a dead end. Belongs on `/insights` with **U7** — identical observe-then-score shape. |
| 🔴 U9a | **"Day 8 of 7"** | `ActiveExperiments.tsx:23` computes `elapsedDays` from `start_date` and renders it unclamped against `totalDays`. The demo account currently displays *"Day 8 of 7 · no measurements logged yet"* — an experiment past its own window, with no terminal state, counting up forever. | An experiment that has run past its window must reach a state — "ready to score" — not keep counting. Fix with U9; the absurd counter is the symptom, the missing scoring path is the disease. |
| 🔴 T1 | **Recovery Mode names none of the things it kept** | Today in Recovery Mode renders "KEPT TODAY" as `Class / commitment` three identical times. `RecoveryBanner.itemLabel()` resolves real titles for tasks via `tasksById`, but falls back to the generic `KIND_LABEL` for ids starting with `event-` — and calendar events are never passed to the component, only `todayTasks`. | The one screen whose entire job is to say *"here are the few things that actually matter today"* names none of them. Keep `MvdCandidateItem` pure (`{id, kind, riskScore}`, no display strings — that's correct); do the title join in the UI/api layer. |
| 🔴 T2 | **Recovery Mode removes every possible action** | `today/page.tsx` (~line 118) branches three ways; in recovery mode it renders *only* `<RecoveryBanner>`. No MitList, no WorkloadBand, no DeadlineRadar, no KillListSection, no FocusLauncher. | **Lead ruling: reducing scope is right, removing agency is wrong.** The state a user is in when they are struggling most is currently the state with zero available actions — they cannot complete a task or start a focus session. Recovery Mode must render the kept MVD items as *actionable*, plus protections, with deferred work still visibly deferred. Narrow the screen; don't blank it. |

**Process note — the fifth gap caught by audit rather than review, and the first caught by simply
using the product.** E1–E5 came from a reachability audit; U9/T1/T2 came from signing in as the demo
user and looking. Both are cheap. Neither had been done. *Every screen renders* and *every test
passes* were both true the whole time.

---

## 🔴🔴 B1/B2 — Course detail is broken on both platforms (Lead, 2026-08-22)

| # | Item | Notes |
|---|---|---|
| 🔴 B1 | **`/courses/[id]` returns a hard 500 on every course, both platforms** | `computeRiskAssessment` (`packages/api/src/day/risk.ts`) fetches deliverables **unscoped by course** (`.eq('user_id', userId)`), but builds `courseById` only from the `courses: CourseFacts[]` **parameter** — and both course-detail loaders (`apps/web/src/app/(app)/courses/[id]/data.ts:59`, `apps/mobile/src/lib/useCourseDetailData.ts:72`) pass a **single-element** array. Every deliverable belonging to another course misses the map and hits the deliberate `throw` at `risk.ts:130`. Broken for any account with deliverables in more than one course — i.e. every realistic account. **Pre-existing**, verified: neither file was modified in the working tree when found. |
| 🔴 B2 | **Archiving a course will 500 the Courses list, Calendar and Today** | Latent, introduced with `courses.archived_at`. `listCourses` now excludes archived courses, so `courseFacts` in `courses/data.ts:48` and `calendar/data.ts:56` excludes them — while `computeRiskAssessment` still fetches *all* deliverables including archived courses'. Same missing-course `throw`. The column works and its pgTAP passes; the failure only appears once a user actually archives something. |

**One fix covers both:** scope the deliverables query to the course ids passed in
(`.in('course_id', courses.map(c => c.id))`). That makes the function's contract honest — *risk for
these courses* — and is behaviour-preserving for the existing all-courses callers, since `.in()`
over every course id is equivalent to unscoped.

**Keep the `throw` at `risk.ts:130`.** It is correct and it did its job: it failed loud rather than
rendering a fabricated course label, which is the only reason this was found at all. Do not soften
it into a filter or a fallback.

**Why it was never caught:** there is **zero E2E coverage of course detail** — nothing in
`apps/web/e2e/*.spec.ts` visits `/courses/`. The live check recorded in `HANDOFF.md` was of the
Courses *list*, which is fine, not course *detail*, which has never worked. A route that hard-500s
on every real account with no test touching it is the actual root cause; the query scoping is just
the proximate one.

---

## ~~🔴🔴🔴 B4~~ — Day boundaries are derived from UTC across the domain layer

> **The most serious logic defect in the codebase.** It breaks the one rule `CLAUDE.md` emphasises
> hardest: *"This product is about local days. Never derive a day boundary from UTC."*

**Mechanism.** `dayView.ts:81` and 8+ sibling sites build a day window as
`new Date(`${today}T00:00:00Z`)` — where `today` is the user's **correctly computed local date**
(from `getUserLocalToday`). Appending `Z` then asserts that local date is a **UTC** instant.

For `America/Indiana/Indianapolis` (UTC−4 in August), local midnight is `04:00Z`, not `00:00Z`. So
every window is wrong by the user's UTC offset at **both** ends. Confirmed by arithmetic, not
inference: a task session created during the gap falls outside the window and disappears from
`todayTaskSessions` entirely.

**This is not an edge case.** The window is wrong for roughly 4–8 hours out of every 24 — the size
of the offset — for every user not sitting exactly on UTC. Near midnight in the user's own local
time, task sessions, deadline urgency, congestion hours and Recovery Mode's deadline horizon can all
silently use the wrong day.

**Known sites** (to be enumerated exactly before fixing): `dayView.ts` · `backplan.ts` ·
`weeklyPlan.ts` · `recoveryMode.ts` · `workload.ts` · `risk.ts` (`sumCalendarHoursInWindow`) ·
`mvd.ts` · the Deno mirror's `domainQueries.ts` (×2).

**The fix already exists and was never used.** `localTimeToInstant(date, hour, minute, timezone)` is
in `packages/core` and is already used correctly by `CheckinForm.tsx`. This is a *"the right tool was
never reached for"* bug, not a missing capability.

**Requirements:** prove the red first, with a **timezone-parameterised** regression (a UTC-positive
zone, a UTC-negative zone, and a fixed `now` inside the broken gap — a test that passes only because
CI happens to run at 14:00 UTC is how this survived). Fix every site including both Deno mirror
copies. Check whether persisted rows are already wrong. Consider a `check:*` guard for the
`T00:00:00Z`-concatenation idiom — if it was copied eight times, a ninth exists somewhere.

**Resolved (commit `3b38366`).** 15 sites measured, not "8+" — the 8 listed above plus
`planning/weeklyPlan.ts`'s `dayCount` (correct by luck, both operands wrong the same way, cleaned up
to `daysBetween` anyway) and a second Deno-mirror gap found while fixing this one: `domainQueries.ts`'s
`computeRiskAssessment` had the SAME unscoped-deliverables bug B1/B2 fixed on the Node side, missed
because only `packages/api/src/day/risk.ts` was touched when B1/B2 landed — fixed here too. Red proven
deterministically (`dayViewTimezoneBoundary.itest.ts`, a fixed `now` inside the gap for both a
UTC-negative and a UTC-positive zone, no wall-clock dependency), fixed by threading `timezone` through
every affected function and replacing the naive construction with `localTimeToInstant`. Full itest
suite green except B5 (see below, now also resolved). See B8 for the proposed guard.

## ~~🟡 B5~~ — Seeded fixtures drift against real wall-clock time, and the integration suite is red

Three integration tests currently fail (`agentReports.itest.ts` ×1, `dayView.itest.ts` ×2) on
Recovery-Mode assertions, apparently because seed data is anchored to **relative offsets from
whenever it was seeded** and those offsets no longer produce the intended scenario as real time
advances. **Not yet root-caused** — recorded as observed rather than explained.

**Measured by the Lead on a clean tree, 2026-08-22:** `npm run test:integration -w packages/api` →
**4 failed · 82 passed (86 total), 3 failed files.** Not estimated, not relayed — run.

Note which test catches B4: `focusSessions.itest.ts` → *"a completed session actually appears on the
Day Trace end-to-end — **not just written, but read back** through `getDayView`."* That assertion
exists precisely because verifying a write is not the same as verifying a read, and it is the one
test in the suite positioned to notice that the session vanishes from the window. The discipline
paid for itself.

**Separately and more importantly:** this means **the integration suite is currently red — 4
failures counting B4's.** `npm run verify` does not run the itests (they need a live DB), so *"verify
is green"* has been simultaneously true and not the whole picture, for an unknown length of time.
That is a D14-shaped lesson: the thing you don't run routinely is the thing that rots.

**Resolved (commit `5bf5046`), properly root-caused rather than patched.** seed.sql plants everything
relative to `current_date` AT SEED TIME — a snapshot, not a live value, that only "looks current"
immediately after a fresh `db reset`. Three tests computed their reference dates from real
`new Date()` and implicitly assumed it still lined up with whatever the DB was last reset to.
Independently confirmed the drift's exact size two ways: the demo account's own `agent_reports` row
(2026-07-28) matches `recoveryDay = seedToday - 22` exactly, and three tasks seeded as "due today"
had drifted into "overdue within the last 7 days," independently tripping the `overdueTasks` signal
for a reason unrelated to the 22-day-old scenario the test was actually about. Per the Lead's framing
— *tests control `now`, not the seed becomes static* — every affected test now recovers its reference
date directly from the seed's own persisted anchor rows (the `recovery_mode_triggered=true`
`daily_checkins` row; the most-recent/earliest `agent_reports`/`daily_summaries` rows), never from
real wall-clock time. `dayView.itest.ts`'s "ordinary day" test (same shape, not yet failing) got the
same treatment on inspection — it was passing by accident against an uncorrelated date, not because
its assertion meant anything. Audited the rest of the itest suite for the same class: every other
`new Date()`-relative test creates its own throwaway-account fixture at test-run time (self-consistent,
not comparing against a frozen seed snapshot) — not the same bug. 21 files, 88/88 green, twice.

## ~~🟡 B6~~ — An all-day calendar event contributed a full 24h of committed time

`calendar_events` has no `is_all_day` column of its own — that flag exists only on the ICS staging
table (`ics_event_extractions`) and is used exactly once, in `brightspace/confirm.ts`, to pick a
default duration (24h vs 1h) when `DTEND` is absent, then discarded. `confirmIcsEvent` hardcoded
`is_busy: true` regardless, so a promoted all-day entry (a reading day, a break, a no-class day)
looked identical to a real 24-hour timed commitment to every committed-hours consumer (`risk.ts`,
`recoveryMode.ts`, `backplan.ts`, `workload.ts`, the Deno mirror) — deflating capacity and inflating
risk on exactly the days a student has *more* free time, not less.

**What should an all-day event contribute? Zero — not a policy preference, a constraint.** The flag
doesn't survive promotion into `calendar_events`, so there is no way to distinguish a real all-day
commitment (a field trip, an institution-published exam block) from a floating label ("Fall Break")
with the data actually available. Treating it as committed time would fabricate a fact we don't have;
the same "understate rather than invent" rule as everywhere else in this codebase.

**Resolved (commit `93684fe`).** One line: `is_busy: !row.is_all_day` instead of a hardcoded `true`.
No new column, no consumer changes — every consumer's existing `.eq('is_busy', true)` filter already
does the right thing once it's told the truth. `confirm.ts` had **zero test coverage** before this —
the sole write path for an entire table, untested. New `confirm.test.ts`: an all-day event proven red
first, a timed event proving real committed time stays untouched. Checked for poisoned persisted
data — zero `calendar_events` rows anywhere in this DB are `is_busy=true` with a >=20h span (no real
Brightspace sync has run here), nothing to repair.

## 🟡 B8 — No staleness guard for packages/api logic hand-ported into supabase/functions/_shared/

`check:core-mirror` proves `supabase/functions/_shared/core` matches `packages/core/src` — but that
guard covers **only** the domain-engine mirror. `supabase/functions/_shared/nightly/domainQueries.ts`
is a *different* kind of duplication: hand-ported **query composition** from `packages/api/src/day/*.ts`
(documented in its own header as deliberate, since the Deno Edge Runtime can't import
`@supabase/supabase-js`-dependent packages the same way `_shared/core` was mechanically mirrored). It
has zero automated staleness check.

**This is exactly how B1/B2's fix went stale in one place.** `packages/api/src/day/risk.ts`'s
unscoped-deliverables bug was fixed there, but the identical bug in `domainQueries.ts`'s hand-ported
copy of `computeRiskAssessment` was never touched — found only because B4 happened to require editing
the same function again for an unrelated reason. Without that coincidence, an archived course's own
deliverable would have 500'd the nightly pipeline with no guard to catch it.

**Proposed, not built:** a `check:*` script analogous to `check-core-mirror.mjs`, but structural rather
than textual — each ported function in `domainQueries.ts` already carries a `// Ported from
packages/api/src/day/X.ts` comment; a guard could parse those comments, diff each pair's query-shape
essentials (selected columns, `.eq`/`.gte`/`.lt` filters, `.in()` scoping), and fail loud on drift,
the same "impossible to forget" property the four existing `check:*` guards already have. Smaller
version: at minimum, lint for the raw `${date}T00:00:00Z` idiom this session just spent two commits
removing, so a tenth site can't quietly reappear.

---

## 🔴 B3 — Seven routes have zero end-to-end coverage

Audited after B1. Every `goto()` in `apps/web/e2e/**` covers only:
`/` · `/login` · `/signup` · `/forgot-password` · `/today` · `/courses/[id]` (added *because* of B1).

**No test visits** `/courses` (list) · `/calendar` · `/insights` · `/review` · `/review/[date]` ·
`/settings` · `/focus/[sessionId]`.

B1 proved what that costs: `/courses/[id]` returned a hard **500 on every real course, on both
platforms**, for an unknown length of time, while `npm run verify` was green, 332 unit tests passed,
356 pgTAP assertions passed, and 17 E2E tests passed. **Nothing in the suite was capable of noticing.**

**Required:** an authenticated smoke spec that visits *every* route against the seeded demo account
and asserts a 200 plus the absence of an error boundary. Cheap, mechanical, and exactly the class of
guard that has already caught a real defect four times in this build (`check:imports`,
`check:core-mirror`, `check:barrel-exports`, `check:demo-clean`).

Two design requirements, learned from B1:
- **Iterate over every course the fixture has, not "the first course."** A one-course fixture cannot
  reproduce B1 — the bug requires a deliverable belonging to a course *not* in `courseFacts`. The
  obvious test would have passed against the bug.
- **Assert against a realistic account, not a minimal one.** Every previous verification passed
  because it ran against thin or seeded-just-so data.

---

## ~~🔴 V1~~ — Night-review voice input ✅ **RESOLVED (web built, mobile verified)**

Found auditing `docs/context/SOURCE_BRIEF.txt` against the product (the sixth audit of this kind;
every one has found something).

The brief's night-review mockup (lines ~1990–2008) marks **all three fields** as `[voice/text]`:

```
What are you proud of?      [voice/text]
What went wrong?            [voice/text]
Anything important today?   [voice/text]
```

followed by: *"Voice input may be extremely valuable here because speaking for sixty seconds is much
easier than writing a long journal every evening."*

Our night review is **three text-only textareas** — and the field names match the brief almost word
for word, so the screen was clearly built from this mockup and voice was simply dropped.

**Why it matters more than a nice-to-have.** The brief's own thesis is that *"continuous
self-reporting creates burden and adherence problems, which argues for a system where passive data
is automatic and manual check-ins are extremely short."* Voice is the stated mitigation for the one
remaining high-burden manual ritual in the entire product. A journal nobody fills in produces no
friction logs, no calibration actuals, and no input for the nightly analysis — the Reflect step goes
quiet and the loop opens. This is the same class as **R2** (the review being a journal rather than an
instrument) and they should be designed together.

**Feasibility — stated honestly, because the platforms differ sharply:**
- **Web:** the built-in `SpeechRecognition` / `webkitSpeechRecognition` API. No dependency, no key,
  no service. Chrome and Safari support it; Firefox does not, so it must degrade to text rather than
  disappear.
- **Mobile:** harder. `expo-speech-recognition` is a config plugin requiring a **custom dev build**,
  which breaks the Expo Go managed workflow this project runs on. Needs a real decision — Lead's
  call, not an engineer's — between accepting a dev-client build, finding a managed-workflow route,
  or shipping voice on web only and documenting the divergence.

**LEAD RULING (2026-08-22) — build web voice; mobile already has it for free.**

The asymmetry above dissolves once you notice what mobile already provides: **every iOS and Android
soft keyboard ships a dictation key.** Any `TextInput` on mobile is *already* a voice-input field,
provided by the OS, with no dependency, no dev build, and better accuracy than anything we'd wire up.
The brief's actual requirement — *"speaking for sixty seconds is much easier than writing"* — is
already met on mobile today.

Browsers give no such affordance inside a `<textarea>`, which is exactly why web needs an explicit
control and mobile does not.

So:
- **Web:** an explicit mic control on each of the three fields using the built-in
  `SpeechRecognition` API. No dependency. Must **degrade to text-only where unsupported** (Firefox)
  rather than render a dead button.
- **Mobile:** no mic UI. Instead, **verify that nothing suppresses keyboard dictation** on those
  fields — no `keyboardType` or `textContentType` that hides the mic key, no custom input accessory
  that covers it. Then say so in the UI copy if useful.
- **No custom dev build.** Breaking the Expo Go managed workflow to duplicate a capability the OS
  already provides would be a bad trade, and it would slow every future on-device verification.

This is allowed divergence under `SCREEN_SPEC`: the *capability* is identical on both platforms, the
*idiom* differs because the platforms differ. It is not a feature gap and must not be recorded as one.

**Do not half-build it.** A mic button that silently fails, or that works on one platform while the
other pretends the capability doesn't exist, is worse than text-only.

---

## 🟢 B7 — Web session drops in the automation harness (**not a product defect on current evidence**)

**Status: recurring, reproduced only incidentally, mechanism unknown, now instrumented.** Filed
honestly rather than as a diagnosis.

**Symptom.** While browsing as the demo user the session dies: the `sb-…-auth-token` cookie is gone
and every protected route bounces to `/login`. Seen at least four times on 2026-08-22.

**Why it went undiagnosed for so long — and how I got it wrong.** `proxy.ts` destructured only
`data` from `auth.getUser()` and **discarded the error**. So every occurrence left a completely
empty server log, and the Lead concluded from that empty log that there was no auth failure at all.
That was circular: the log was empty *because* the error was being thrown away. Instrumented in
`b901fbd`/`08bb1f8`, and the failure is now visible:

```
[proxy] auth.getUser() failed on /review:   code=unknown status=400
[proxy] auth.getUser() failed on /insights: code=unknown status=400   (×3)
```

**What is ruled out.** A 500 response does **not** clear the cookie — tested directly (sign in →
`/today` 200 → `/courses/3` 500 → `/today` 200), cookie count stayed at 1 throughout. So B1's 500s
were not the cause, despite the correlation that first suggested it.

**What the evidence says.** `code` is `undefined` on a 400. A `refresh_token_not_found` carries a
real code, so this is a **different error class** — which is the most useful fact we have. The
message is now logged outside production; it had not reproduced again as of filing.

**RESOLVED-ENOUGH, 2026-08-22 — the message arrived and it changes the reading.**

```
[proxy] auth.getUser() failed on /insights: code=unknown status=400 message="Auth session missing!"
```

*"Auth session missing!"* is what `supabase-js` returns when it finds **no session in the cookie
store at all**. It is not a rejected token, not an expired one, and not a server-side refusal — the
400 is simply how the client reports "there is nothing here to check." So the evidence points back
to the cookie being **absent**, which was my *original* reading before I over-corrected on the
strength of an error appearing at all.

Two further facts settle it:
- **The app's own session-persistence E2E test passes** — `session.spec.ts`, *"a signed-in session
  survives a hard reload and stays off auth routes"*, run directly: **2 passed**. That test exercises
  exactly the behaviour B7 alleged was broken.
- The session survived **eight rapid `fetch()` calls** in a row every time, and only ever vanished
  across a Playwright-MCP `browser_navigate`.

**Current conclusion: an artifact of the MCP browser context, not a defect in CollegeOS.** Filed
green and closed pending contrary evidence. If a real user ever reports being signed out, reopen
this — the instrumentation is in place and will now say what happened.

**Lesson worth more than the bug.** I got this wrong twice in opposite directions: first concluding
"no auth failure" from an empty log (which was empty *because the error was being discarded* —
circular), then concluding "real auth failure" the moment an error appeared (without asking what the
error *meant*). An error existing and an error mattering are different claims. The instrumentation
was still worth adding: it cost two lines and converted an unfalsifiable hunch into a closed
question.

**Do not "fix" `proxy.ts` or the cookie adapter speculatively.** Both are correct per the
`@supabase/ssr` contract, and the Server-Component `setAll` swallow is intentional and documented.
The next step is the message string, not a patch.

---

## ✅ The nightly pipeline has now actually run (Lead, 2026-08-22)

Recorded because for the entire build it had **never executed in the real request path** — every
edge function returned 503 locally, since `supabase start` brings up no edge-runtime container (see
`tooling-gotchas.md`). Everything we knew about `nightly-analysis` came from unit and integration
tests of its parts.

With the runtime serving, invoked for the demo account against a real day:

```
POST /functions/v1/nightly-analysis  {"userId":"…d1","localDate":"2026-08-21"}
→ {"ok":true,"data":{"processed":1,"outcomes":[{"reportId":27,"model":"deterministic",
   "usedModel":false,"insightsDetected":5}],"failures":[]}}
```

Confirmed in the database afterwards: a new `agent_reports` row for 2026-08-21, a new
`daily_summaries` row for the same date, and the insight count rising to 7.

**What this proves:** the whole Observe → Reflect → Learn chain — context assembly, the summary
pyramid write, deterministic report generation, insight detection and confidence gating — executes
correctly end to end against real data.

**What it does not prove:** `usedModel: false`. There is still no `ANTHROPIC_API_KEY`, so the model
layer did not run and the deterministic fallback produced the report. That is the designed behaviour
and the report says so on screen. **The model path remains unverified** (`HANDOFF.md` §5.3) — but the
failure is now provably *the model call*, not an unreachable function, which is a materially
different and much narrower gap.

Side effect worth knowing: this also partly closes **R3**. The demo account's report history had a
three-week hole (Jul 28 → Aug 18); it now has an Aug 21 entry generated by the real pipeline rather
than hand-seeded.

---

## Security-review follow-ups (L14 §4, 2026-08-22)

The review found **no vulnerabilities**. These are three precision items it surfaced that would
otherwise live only in a code comment or in someone's memory.

| # | Item | Notes |
|---|---|---|
| 🟡 S12 | **SSRF guard's DNS-rebinding limitation is tracked only in a code comment** | `ssrfGuard.ts`'s header honestly states that checking the resolved IP *"reduces but does not eliminate"* the risk, and that a full fix (resolve-then-pin, or an egress proxy) is not built. That's the right disclosure in the right place — but it appears **nowhere in this file**, so nobody reviewing the follow-up list would ever learn of it. A limitation that lives only next to the code it limits is invisible to exactly the people who plan work. 13/13 guard tests pass; the gap is tracking, not behaviour. |
| 🟡 S13 | **"Journal content is never logged" is currently true by absence, not by tested redaction** | Verified precisely rather than generously: `journal_entries` has **zero readers and zero writers** anywhere in the codebase, so the strongest claim available is *the feature does not exist yet*. The actively-used sensitive fields (`daily_reviews.proud_text` / `went_wrong_text` / `important_note_text`) **are** clean — traced to a single consumer that folds them into the sanctioned summary-pyramid compaction, with no `console.log` of content anywhere in `supabase/functions` and no crash-reporting integration in the repo at all. **Re-test the day journal entries are actually built.** A guarantee that holds because a feature is missing stops holding the moment it ships, and that is precisely the kind of thing nobody remembers to re-check. |
| 🟢 S14 | **`whoop-webhook` returns 500 rather than 401 for unauthenticated calls** | Not a gap — it fails **closed** (`"Server misconfigured: WHOOP webhook environment is incomplete"`) before reaching its HMAC check, because no WHOOP credentials are configured locally. The property that matters holds. But once real credentials exist, a 500 there will read as *"something broke"* rather than *"auth refused"*, and someone will debug the wrong thing. Worth a correct status code at that point. |

**Also confirmed clean, recorded so it isn't re-litigated:** all 46 public tables have
`relrowsecurity` **and** `relforcerowsecurity` (subject even for the owner role); no `service_role`
reference in a real `expo export` bundle for **either** web or iOS (compiled Hermes binary grepped
directly, not inferred from the `EXPO_PUBLIC_` prefix rule); all 11 edge functions reject both an
absent auth header and an anon-key-only call; and all four of `SUPABASE_SETUP.md`'s
must-fix-before-launch items are still accurate and still flagged.

---

## Smaller items from the 2026-08-22 live review

| # | Item | Notes |
|---|---|---|
| ~~🟡 R1~~ | ~~Night review shows `0/0 completed` on a day with nothing planned~~ **RESOLVED** | On the demo account's current day, "TONIGHT'S NUMBERS" reads `MITS 0/0 completed` · `DEEP WORK 0 / 0 min`. `0/0` reads as failure; it actually means *nothing was planned*. Same family as the fabricated-80% prediction default — a real zero and an absent value are different facts and must not render identically. Should say "no MITs planned" (or omit) rather than `0/0`. |
| 🟡 R2 | **Night review is three identical free-text boxes** | "What went well / what went wrong / anything important" is a journal, not an instrument. The product's whole thesis is that the record argues with the story — so the review should lead with *confirming or disputing what the record already says* (friction causes, prediction vs. actual), with prose secondary. `FrictionPicker`, `ReviewDraft` and `EvidenceClaimList` all exist as components; the current form doesn't lead with them. Design work, not a defect. |
| 🟢 R3 | **Demo seed: the showcase report history has a three-week hole** | `daily_summaries` holds 6 consecutive days (Aug 13–18) but `agent_reports` holds only **2** rows — Aug 18 and **Jul 28**. So `/review/[date]`'s history sidebar shows two entries three weeks apart. **Verified NOT a code defect** — `listAgentReports` and `ReportHistoryList` are both correct, and the two tables are genuinely different things. It's seed quality, and it matters only because this is the account every screenshot is taken from. |

**Verification note:** R3 was initially suspected as a broken history query (6 rows in the database,
2 rows on screen). Checking the actual source — `agent_reports`, not `daily_summaries` — showed the
UI was right and the seed was thin. Recorded here as a reminder that "the number on screen doesn't
match the number in the table I checked" usually means *I checked the wrong table*.

---

## Found at session close

| # | Item | Notes |
|---|---|---|
| 🟡 C1 | **Mobile sign-in email field doesn't reliably clear/retype** | Reported **deterministic** on the iPhone 16 Pro simulator once that sim has prior login history — worse than the intermittent AutoFill behaviour seen earlier the same session. Needs root-causing on a **real device** before being written off as a simulator artifact: if it reproduces there, it's a genuine sign-in bug and it sits on the very first screen a returning user touches. Likely suspects: `textContentType`/`autoComplete` config on the email `TextInput`, or controlled-input state not syncing on re-entry. |

---

## Must fix before launch 🔴

| # | Item | Notes |
|---|---|---|
| 🔴 L1 | **Custom URL scheme (`collegeos://`) is hijackable** | Another app registering the same scheme can intercept an auth callback — on a confirmation or reset link that means intercepting a session. Fix is **Universal Links (iOS) / App Links (Android)**, domain-verified. Needs a real domain + AASA file. Documented in `SUPABASE_SETUP.md` §5. |
| 🔴 L2 | **`exp://127.0.0.1:8081/**` must be removed from the redirect allow-list** | Development only. Annotated in `config.toml`. |
| 🔴 L3 | **Custom SMTP required** | Supabase's built-in mailer is rate-limited and not for production; confirmation emails will silently throttle. |
| 🔴 L4 | **No `ANTHROPIC_API_KEY` yet** | LLM layer is fully built and tested offline against golden fixtures. `SUPABASE_SETUP.md` §7 has the ordered 5-step activation checklist — including: if the live response shape differs from a fixture, **update the fixture from reality, never patch the test to pass**. |

---

## Should fix 🟡

| # | Item | Notes |
|---|---|---|
| 🟡 S1 | **Integration tests depend on a shared mutable credential** | Both suites sign in as `demo@collegeos.app`. Any mutation breaks them, and it surfaces as "sign-in failed" rather than "the fixture moved" — which already cost Atlas debugging time once. Fix: create a throwaway user in `beforeAll`, or assert-and-repair the credential deterministically. |
| 🟡 S2 | **Test users accumulate in the local DB** | Post-restart audit: **14 `auth.users`** and **11 courses** against a seed of 1 user / 5 courses. The E2E test-user factory has teardown, but ~13 orphans suggests it doesn't run on all paths (failed specs, storage-state setup users). Risk: slow drift, and any test that enumerates users gets noisier over time. |
| 🟡 S3 | **Demo user's password hash drifted once, cause unknown** | Verified it was *not* E2E (those use isolated users) and nothing calls `updatePassword` on the demo account. Left explicitly **unexplained** rather than recording a plausible guess as a finding. S1 makes it moot. |
| 🟡 S5 | **No stale-task surface** | `recoveryMode.ts`'s `overdueTaskCount` is now windowed to 7 days (correct — an unbounded count made Recovery Mode a *permanent* state once 3 tasks were abandoned, which destroys the feature). Second-order consequence: tasks older than 7 days now count for **nothing** and nothing surfaces them, so the product silently accumulates dead tasks — violating "nothing the system defers is silent." Needs a periodic prompt: *"these have been sitting three weeks — still real?"* Belongs with friction logging (L6) or insights (L8). A task nobody will ever do is noise in every risk calculation it touches. |
| ~~🟡 S4~~ | ~~`pg_cron` not verified locally~~ | **Resolved (L7).** Verified live: `pg_cron` works fully locally, no `shared_preload_libraries` issue — `cron.schedule()` registers real jobs and they actually fire (`net.http_post` from the `db` container reaches the Edge Runtime via `http://kong:8000/...`, not `127.0.0.1`). See D17 in `decisions.md`. The migration (`00000000000014_scheduled_jobs.sql`) instead gates job *registration* behind a Vault secret existing, so a fresh `db:reset` still registers zero jobs by default — a different, more deliberate safety reason than extension availability. |
| ~~🟡 S6~~ | ~~No automated guard against demo-account contamination~~ | **Resolved (L9).** `scripts/check-demo-clean.mjs` built, wired into `verify`. Dynamically discovers date/timestamp columns via `information_schema` rather than a hardcoded table list. Proved catching real injected contamination both ways (clean pass, then a deliberately-injected 2099 row + a `pow-test-*` title, both caught) — first version silently missed the date-column finding because psql sends `RAISE NOTICE` to stderr and the guard's `execFileSync` call only captured stdout; fixed by switching to `spawnSync` and reading both streams. |
| ~~🟡 S7~~ | ~~No automated guard against unreachable public exports~~ | **Resolved (L9).** `scripts/check-barrel-exports.mjs` built, wired into `verify`. Walks `packages/api/src/**`/`packages/core/src/**`, resolves real reachability by following both named and wildcard (`export *`) re-exports recursively from each package's actual entry points (`packages/api` has three: `index.ts`, `platform/web.ts`, `platform/native.ts`). First run false-flagged `packages/core`'s entire public surface because its barrel is wildcard-only and the initial version only understood named-list re-exports — fixed by resolving and recursively following `export *` targets. `@barrel-internal` opt-out comment for genuinely internal modules (result-constructor helpers, functions that only feed an already-exported aggregate). |
| 🟡 S8 | **Unscoped integration-test assertion queries silently accumulate cross-test-run matches** | Found live at L10 (`syncFeed.itest.ts`): an assertion query filtered only by `external_id`, no `user_id` — since every test run creates a fresh throwaway user (D14) but reused the same literal fixture UID, the query silently picked up matching rows from *every prior run*, not just the current one. The row count grew monotonically (2, then 3, then 4) across repeated runs, which looks like healthy accumulating data rather than a broken assertion — the most dangerous kind of false green, since D14's own "run it 3x" rule is what surfaced it despite the assertion technically passing every single time. **New standing rule** (worth a `decisions.md` entry alongside D14, the Lead's call): every integration-test assertion query against a shared local database must be scoped by `user_id` (or whatever the test's actual isolation key is) — an unscoped query is not an assertion about the test's own behavior, it's an assertion about the whole table's history. |
| ~~🟡 S9~~ | ~~`whoop-webhook` does not fetch the referenced resource~~ | **Resolved in `7553a05`, and this row was stale.** The full loop is wired in `_shared/whoop/webhookHandler.ts`: `isTokenExpiringSoon` → `refreshAccessToken` → resource fetch (`createWhoopResourceFetcher`) → normalize → `ingestWhoopTelemetry` → rollup. Verified by reading the call chain, not the commit message. **Second stale row found this session** (after U2, which was recorded as unbuilt two commits after it shipped and was nearly rebuilt). Standing rule: a FOLLOWUPS row is a claim about the past — re-verify it against HEAD before acting on it. |
| 🟡 S10 | **Mobile data export can't offer a real file save on Android** | Measured a real demo-account export via `account-export`: 224,596 bytes (~220KB) across 45 tables — not itself too large for anything. The actual problem: RN's built-in `Share.share()` only documents a `url` content key on **iOS**; Android's share intent through this same API takes only `title`/`message`. So mobile export now branches — iOS writes a real file (`expo-file-system`, added this session, the one new dependency the Lead approved) and shares its `url`, giving a genuine "Save to Files" action; Android falls back to sharing the JSON as `message` text, which is NOT a saved file, just share-sheet text. Real file sharing on Android needs a `FileProvider` `content://` URI, which is `expo-sharing`'s job, not installed. Not fixed tonight — flagged rather than silently shipping an Android path that looks the same as iOS's but isn't. |
| ~~🟡 S11~~ | ~~iOS export's cache file survived indefinitely under a predictable name~~ | **Resolved same session, caught by automated commit review.** The temp file `DataExportDeletionSection.tsx` writes to `Paths.cache` before sharing is the user's entire personal record — every table, every interpretation the system has formed about them — and the first version never deleted it: it sat on disk indefinitely, readable by anything with filesystem access, and **survived account deletion** (deletion clears the database, not a file the app left behind). Fixed: the file is deleted in a `finally` block regardless of share outcome, since `Share.share()` only resolves after the sheet is dismissed (so a "Save to Files" copy already exists elsewhere by the time the temp copy is removed). **The cache copy is intentionally transient — do not "optimize" it later by keeping it around for re-sharing.** |

---

## Nice to have 🟢

| # | Item | Notes |
|---|---|---|
| 🟢 N1 | **Mobile has no calibrated-grid texture** | Accepted platform divergence — sub-perceptual at phone viewing distance; not worth a dependency or asset pipeline. Documented in `DESIGN_SYSTEM.md` §6.3 as a *decision*, not a TODO. Revisit at L11 if mobile reads flat beside web. |
| 🟢 N2 | **iPhone 17 Pro simulator record is corrupt** | "Unable to boot deleted device." Using iPhone 16 Pro. `xcrun simctl delete` + recreate when convenient. |
| 🟢 N3 | **`globalMeanStartDelayDays = 1.5` is a prior, not a measurement** | Correct for a single-user product with no population to average. Named constant, commented, and confidence downgrades when used. Revisit only if the product ever has multiple users. |
| 🟢 N4 | **`completedUnits`/`plannedUnits` derived from tasks** | Proxy for the brief's "planned study sessions." No dedicated units column. Acceptable — tasks are the real signal available. |
| 🟢 N5 | **Mobile has no syllabus-upload entry point** | Accepted platform divergence, not a gap — `expo-document-picker` was explicitly denied earlier this session because the flow dead-ends without an `ANTHROPIC_API_KEY` configured anywhere in this environment: the dependency would buy an upload that goes nowhere. Web's syllabus upload (item 5) already proves the honest failure-and-manual-entry path; mobile's ICS pending-confirmation card (the other half of item 5) is built and needs no file picker. **Revisit this decision, don't silently re-deny it, the day a real `ANTHROPIC_API_KEY` is configured** — at that point the mobile upload entry point becomes a real gap, not a reasoned omission. |
