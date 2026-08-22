# CollegeOS — Handoff

> **Read this first.** What exists, what was verified and *how*, what was **not** verified, and
> exactly what remains.
>
> Then read, in order: `CLAUDE.md` → `.brain/memory/decisions.md` (D1–D22) → `docs/STATUS.md` →
> `docs/FOLLOWUPS.md`.

---

## 1. What this is

A personal **closed-loop operating system** for a college student. Not a habit tracker.

```
Observe → Plan → Execute → Detect deviation → Intervene → Reflect → Learn → Update next plan
```

Three laws that govern every decision in the codebase:

1. **Postgres is the system of record.** Not the LLM, not a third-party app.
2. **Deterministic code calculates; Claude only interprets.** Every score, grade, average and streak
   is pure TypeScript in `packages/core`, unit-tested. The model is never asked to do arithmetic or
   to decide what matters.
3. **Every LLM response is schema-validated typed JSON.** Free-form prose never reaches the UI
   unvalidated, and extracted academic deadlines *always* require explicit user confirmation.

Product intent: `docs/context/SOURCE_BRIEF.txt`. Architecture: `docs/MASTER_PLAN.md`.

---

## 2. START HERE: the one thing that is still broken

**Confirming a weekly-plan block produces nothing. The Plan step never reaches Execute.**
Filed as **P1** in `docs/FOLLOWUPS.md` with a ratified fix. **This is the highest-priority
remaining work in the repo.**

Generate a week's plan, confirm a suggested focus block for *today*, and Today still says
*"Nothing scheduled yet today."* Empty Day Trace, empty Top 3. Verified:

- `weekly_plan_blocks` carries `deliverable_id` and `course_id` and **no `task_id`**.
- **Nothing outside the planning module reads the table** — `dayView.ts` never touches it.
- Per `weeklyPlan.ts`'s own comment, `confirmed` means only *"don't let a regeneration clobber this
  block's time."*

So a student can plan their whole week, confirm every block, and none of it reaches Today. The
brief's Sunday session produces a plan that cannot be executed.

**The ratified fix** (full detail in FOLLOWUPS P1): add `weekly_plan_blocks.task_id`; confirming
creates a real task carrying `planned_date`, `planned_start_at`, `estimated_minutes` and the
deliverable/course link, storing its id on the block; re-confirming is idempotent; **skipping cancels
the task rather than orphaning it**, because "planned then abandoned" is data the friction engine
wants. Setting `planned_start_at` from the block is what makes **start delay measurable for planned
work** — the metric the brief names by example.

It was deliberately **not started**, because a half-finished migration in a shared tree is worse than
a clean one not yet begun.

---

## 3. The finding that defined this session

An earlier handoff described a nearly-finished product. A reachability audit — every exported
`packages/api` function checked for a caller in the real request path — plus signing in as a
genuinely empty account found otherwise:

> **The product had no data-entry path.** No way to create a course, a task, or an assignment. No
> syllabus upload. No way to confirm an imported deadline. A real user signed up to a permanently
> empty app, on both platforms.

Worse, first-run was actively nonsensical: a new user was dropped into the morning check-in and asked
to pick a "Top 3" from nothing, and to predict what percentage of an **empty day** they would finish
— pre-set to 80%. That fabricated 80% was written to `daily_predictions` and later scored against a
real 0%, so **a new user's first-ever calibration data point was an 80-point miss they never made.**

**Why it stayed invisible:** every verification ran against the seeded demo account. *"All screens
render correctly"* was true and proven. *"A user can actually use this"* was never asked.

**This is fixed and proven** (§5). The lesson generalises: **a demo seed is a rendering fixture, not
proof of a usable product.**

---

## 4. Measured state

```
188 commits · 32 migrations · 46 tables · 0 without RLS · 11 edge functions
web: 17 routes · mobile: 16 routes · 23 integration-test files · 8 E2E specs
```

Full regression, every number executed rather than recalled:

| Suite | Result |
|---|---|
| `npm run verify` | **PASS** — 4 guards, typecheck ×5 workspaces, lint, **354 unit tests** |
| pgTAP | **459 assertions**, 10 files |
| `packages/api` integration (real DB) | **101 / 101**, twice consecutively (D14) |
| Deno edge, offline | **86 / 86** |
| Deno edge, live DB | **60 / 60**, twice |
| Playwright E2E, desktop + mobile | **28 / 28**, twice, at `--workers=2` |

Playwright runs at two workers deliberately: single-worker hid a real locator ambiguity. *The setting
that makes a suite pass is not always the setting that makes it useful.*

**Production bundle:** 1,264 KB raw / **348 KB gzipped** across 18 routes. A full day of new UI cost
**+0.6 KB gzipped** — verified by grepping the build for strings from each new surface, not inferred.
No `react-native` leakage; no `service_role` in any client chunk (web *and* a real compiled iOS
Hermes bundle).

---

## 5. What was built this session

**Data entry & onboarding (E0–E5)** — course/assignment/task CRUD, weight categories, grade
boundaries, deliverable detail with backplan generation and proof-of-work config, task quick-add,
syllabus upload → extract → confirm, Brightspace ICS confirmation, and an onboarding gate that checks
for a **real course** rather than a `has_onboarded` flag.
**Acceptance test passing on both platforms:** brand-new account → populated Today, no psql, no seed.

**Loop completion** — U1 interventions (four evaluators that had **never run**) · U3 proof-of-work ·
U5 office hours · U6 weekly planning · U7 decision journal · U9 experiment measurement and scoring.

**Correctness fixes** — B1/B2 (course detail returned 500 on *every* real course, both platforms) ·
**B4** (day boundaries derived from UTC across **15 measured sites**) · B6 (an all-day calendar event
contributed 24h of committed time) · T1/T2 · R1 · R2 · **V1** (night-review voice input, specified in
the brief and never built).

**Design** — L13.0 primitives (motion, depth, five states, `PageHeader`, `Modal`, `Select`,
`DatePicker`/`TimePicker` with `null` as a first-class value) and L13.1 composition, both platforms.

**Hardening** — production performance measured for the first time · full security review · sparse-
account pass · structural accessibility audit · **the RLS guard fixed so it can actually fail.**

---

## 6. What was verified, and how

**The standard: verify the write, not the success state.** Nearly every UI verification confirmed the
actual database row via psql rather than trusting a toast.

- **The nightly pipeline ran end-to-end for the first time.** Every edge function had returned 503
  locally all build, because `supabase start` brings up **no edge-runtime container** and nobody had
  noticed. With it serving: a real `agent_reports` row, a real `daily_summaries` row, 5 insights, zero
  failures.
- **`brightspace-confirm` verified end-to-end** — a real pending ICS event confirmed through the UI,
  producing a real `calendar_events` row.
- **Experiment metric-filtering proven with a decoy**: a planted reading of `999` under a second
  metric name; the rendered verdict was **39.8, not 231.6**.
- **RLS**: all 46 tables have `relrowsecurity` **and** `relforcerowsecurity`.
- **Sparse account** (1 course, 1 task, no history): zero `NaN`/`undefined`/`null` in visible text
  across five routes, and every empty state explains *why* it is empty.

---

## 7. What has NOT been verified — read before trusting anything

### 7.1 The model path has never run
No `ANTHROPIC_API_KEY`. The nightly report comes from the deterministic fallback (`usedModel: false`)
and says so on screen. The failure is now provably *the model call* rather than an unreachable
function — narrower than before, still a gap. **Re-verify first when a key exists.** If a live
response shape differs from a fixture, **update the fixture from reality, never patch the test.**

### 7.2 Accessibility — structural only
A live keyboard pass on web found a real invisible-focus bug in `Modal`. Mobile had a **structural
audit** (static props + the Expo-Web ARIA tree) which found three accessible-name leaks, including a
Checkbox announcing as *"check, No Instagram before 6 PM"*.

**That is not a VoiceOver pass.** A screen reader tests announcement order, whether a live region
interrupts, and whether a name makes sense *spoken*. **A real VoiceOver/TalkBack pass on a physical
device is a required pre-launch item.**

### 7.3 Failure and offline states
All 9 `(app)` routes have explicit error branches — **and the failure pass proved that is not
enough.** With PostgREST stopped and auth still up, **6 of 6 routes tested never reached
DOMContentLoaded within 8 seconds**: the page hangs rather than erroring. Kong's `read_timeout` is
**150 seconds**, set deliberately to match the hosted project, and there is **no request timeout
anywhere in the app's Supabase wrappers**. So the error branches are correct and, for this failure
mode, unreachable inside human patience. Filed as **P2**.

Not reached: `/review`, `/review/[date]`, `/settings`, and — the important one — **the
mutation-mid-flight test.** A failed read is visible; a write that appears to succeed is what costs
real data.

**Offline is unimplemented** and deliberately deferred: "last-known data with an explicit staleness
timestamp" is a caching *feature*, not a hardening task.

### 7.4 Native pickers on mobile
`@react-native-community/datetimepicker` **does not render under Expo Web**, which is how most mobile
verification was done. Every other mobile surface was verified live; the picker submit path was not.
Needs a simulator or device.

### 7.5 `/today` issues round trips, though fewer
A shared `calendar_events` read took `/today` from 5 reads of that table to 2, proven by a
byte-identical `getDayView` payload diff. The wider pattern remains: several domain functions each
re-read `deliverables` and `courses`. Invisible locally (131 ms), **not invisible against cloud
Supabase** at 30–50 ms RTT. `docs/L11_HARDENING.md` §1.

---

## 8. Before this is production-ready

**1. Fix P1** (§2). The loop is cut between Plan and Execute.

**2. Must fix — security** (all four re-verified accurate, `docs/SUPABASE_SETUP.md`):
- **`collegeos://` is hijackable** — needs Universal Links / App Links, a real domain, an AASA file.
- **Remove `exp://127.0.0.1:8081/**`** from the redirect allow-list. Development only.
- **Configure custom SMTP.** The built-in mailer is rate-limited and will silently throttle.
- **Redirect allow-list must use exact hosts, no wildcards.**

**3. Must verify:** cloud deploy · Anthropic activation (§7.1) · a real VoiceOver pass (§7.2) · the
mid-request failure pass (§7.3) · native pickers on a device (§7.4).

**4. Open items:** `docs/FOLLOWUPS.md`. Notably **S13** — "journal content is never logged" is
currently true *because the feature does not exist yet*, not because redaction is tested. **Re-test
the day journal entries ship.**

**Deliberately deferred, with reasons** — these are decisions, not oversights: offline (§7.3) · U5's
contextual surfacing and U8, which need a real rule or real data rather than effort ("repeatedly" is
not a threshold anyone gets to invent) · `computeRiskAssessment`'s shared read, which would cost churn
at eight call sites for a gain at one.

---

## 9. Things a future session would otherwise get wrong

Read `.brain/memory/decisions.md` in full — **D1–D22**. Most likely to be reversed by someone who
doesn't know why:

- **D4** — internal packages are source-resolved (no `dist`). A build step reintroduces a stale-dist trap.
- **D16** — `packages/core` is mirrored into the Deno directory; **the staleness guard is load-bearing.**
  A stale mirror means edge functions compute risk with *different logic* than the apps display.
- **D19** — `private.*` functions need an explicit `public` wrapper. Don't "simplify" by exposing the schema.
- **D20** — a component isn't done until something in the **real request path** calls it. This happened
  repeatedly, and at product scale: an entire *verb* was missing.
- **D21** — a green `verify` says nothing about what is **committed**.
- **D22** — **in a shared tree, commit by pathspec** (`git commit -m "…" -- <paths>`). Two agents share
  one git index; a bare `git commit` sweeps in whatever a peer has staged. This happened.

Also `.brain/memory/tooling-gotchas.md` — the two that cost most: **edge functions return 503 because
no runtime container runs** (`supabase functions serve --env-file ./.env.local`), and **mobile visual
verification works through Expo Web** (`npx expo start --web`), where the simulator's text-injection
corruption doesn't exist.

**The pattern that produced most of this session's findings**, worth internalising:
four separate features shipped in the shape *"stores its own state correctly, and is a dead end"* —
Recovery Mode showed the day and removed every action; experiments could be started and never scored;
decisions could be logged and never scored; and weekly-plan blocks can be confirmed and never
executed (P1, still open). **Every one passed its own tests.** What none of them had was somebody
walking the product end to end asking *"and then what happens?"*

---

## 10. How to work here

```bash
npm run db:start          # local Supabase (Docker must be running)
supabase functions serve --env-file ./.env.local   # edge runtime — NOT part of db:start
npm run db:reset          # re-apply migrations + seed, and refresh Kong
npm run verify            # 4 guards → typecheck → lint → test
npm run test:e2e          # Playwright, real stack
npm run test:integration --workspace=@collegeos/api
supabase test db          # pgTAP
cd apps/mobile && npx expo start --web --port 8082   # mobile, verifiable in a browser
```

**Demo account:** `demo@collegeos.app` / `CollegeOS-Demo-2026` — a realistic seeded semester.
**Read from it; write against a throwaway** (`npm run make:test-user`).

**Working agreements that earned their keep:**
- Verify before claiming. Paste real output. **Typecheck is not evidence.**
- **Green once is not green** — run new integration tests twice (D14).
- **Never fabricate a value.** `—` or omit, never a placeholder number. This extends to layout (a page
  that ends where its content ends is not a defect) and to thresholds.
- **A doc row is a claim about the past.** Several entries here turned out stale mid-session — one was
  nearly rebuilt from scratch. Re-verify against HEAD before acting on one.
- **Ask "and then what happens?"** of every feature you finish.
- Behaviour and information may never diverge across platforms; layout and idiom may.
