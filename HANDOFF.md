# CollegeOS — Handoff

> **Read this first.** It covers what exists, what was verified and *how*, what was **not**
> verified, and exactly what remains before this is production-ready.
>
> Then read, in order: `CLAUDE.md` → `.brain/memory/decisions.md` (D1–D22) → `docs/STATUS.md`.

---

## 1. What this is

A personal **closed-loop operating system** for a college student. Not a habit tracker.

```
Observe → Plan → Execute → Detect deviation → Intervene → Reflect → Learn → Update next plan
```

Three laws that govern every decision in the codebase:

1. **Postgres is the system of record.** Not the LLM, not a third-party app.
2. **Deterministic code calculates; Claude only interprets.** Every score, grade, average and
   streak is pure TypeScript in `packages/core`, unit-tested. The model is never asked to do
   arithmetic or to decide what matters.
3. **Every LLM response is schema-validated typed JSON.** Free-form prose never reaches the UI
   unvalidated, and extracted academic deadlines *always* require explicit user confirmation.

Full product intent: `docs/context/SOURCE_BRIEF.txt`. Architecture: `docs/MASTER_PLAN.md`.

---

## 2. The finding that defined the last session

An earlier handoff described a nearly-finished product. A reachability audit — every exported
`packages/api` function checked for a caller in the real request path — plus signing in as a
genuinely empty account found otherwise:

> **The product had no data-entry path.** No way to create a course, a task, or an assignment. No
> syllabus upload. No way to confirm an imported deadline. A real user signed up and the app was
> permanently empty, on both platforms.

Worse, the first-run experience was actively nonsensical: a brand-new user was dropped into the
morning check-in and asked to pick a "Top 3" from nothing, and to predict what percentage of an
**empty day** they would finish — pre-set to 80%. That fabricated 80% was written to
`daily_predictions` and later scored against a real 0%, so **a new user's first-ever calibration
data point was an 80-point miss they never made.**

**Why it was invisible:** every verification ran against the seeded demo account. *"All screens
render correctly"* was true and proven. *"A user can actually use this"* was never asked.

**This is now fixed and proven** — see §3. The lesson is recorded because it generalises:
**a demo seed is a rendering fixture, not proof of a usable product.**

---

## 3. Current state (measured, not estimated)

```
180 commits · 32 migrations · 46 tables · 0 without RLS · 11 edge functions
web: 17 routes · mobile: 16 routes · 23 integration-test files · 8 E2E specs
```

| Suite | Count |
|---|---|
| `packages/core` unit | **332** |
| pgTAP | **459** assertions, 10 files |
| `packages/api` integration | 100+, run twice (D14) |
| Deno edge (offline) | 84 |
| Web E2E (Playwright) | 8 specs incl. the E0 acceptance test |

`npm run verify` → **exit 0**. Four guards run *before* typecheck; **each has caught a real defect**
that typecheck, lint and review all missed. Do not disable one to make a build pass.

**Production bundle** (measured, `next build` + `next start`): **1,264 KB raw / 348 KB gzipped**
across 18 routes. No `react-native` leakage, no `service_role` in any client chunk (web *and* a real
compiled iOS Hermes bundle), no `date-fns`/`zod` duplication.

---

## 4. What is built

### The loop is closed for the first time
Every step of `Observe → Plan → Execute → Detect deviation → Intervene → Reflect → Learn` now has a
working surface on both platforms. Previously two steps did not:

- **Intervene** — all four evaluators existed, fully tested, with **no caller anywhere**. Nothing
  had ever created an intervention in the real request path; the demo account held zero rows. Now
  swept on every Today load, rendered with real actions, and responses recorded.
- **Learn** — experiments could be *started* and never measured or scored; decisions could not be
  logged at all. Both now close.

### Data entry & onboarding (the §2 fix)
Course CRUD · weight categories · grade boundaries · assignment CRUD · deliverable detail with
backplan generation and proof-of-work config · task quick-add · syllabus upload → extract → confirm ·
Brightspace ICS pending-deadline confirmation · an onboarding gate that checks for a real course
rather than a `has_onboarded` flag.

**Acceptance test, passing on both platforms:** create a brand-new account and, without touching
psql or the seed, reach a Today screen with a real course, a real deliverable and a real task.

### Everything else
Landing/welcome · auth (5 routes) · Today (four engine-decided modes, Day Trace) · morning check-in
with optional timeboxing · night review with voice input on web · Courses · course detail · Calendar
(`This week` / `Horizon`) · weekly planning · Review + `/review/[date]` · Insights (experiments,
decision journal, calibration, friction, bounce-back, planning-vs-execution) · focus sessions · kill
list · office hours · Settings · full data export and account deletion.

---

## 5. What was verified, and how

**The standard: verify the write, not the success state.** Nearly every UI verification confirmed
the actual database row via psql rather than trusting a toast.

Highlights where that mattered:

- **The nightly pipeline ran end-to-end for the first time** (2026-08-22). Every edge function had
  been returning 503 locally for the entire build because `supabase start` brings up **no
  edge-runtime container** — nobody had noticed. With it serving: `processed: 1`, a real
  `agent_reports` row, a real `daily_summaries` row, 5 insights detected, zero failures.
- **`brightspace-confirm` verified end-to-end** — a real pending ICS event confirmed through the UI,
  producing a real `calendar_events` row.
- **Metric filtering on experiments proven with a decoy**: a planted reading of `999` under a second
  metric name; the rendered verdict was **39.8, not 231.6**.
- **RLS**: all 46 tables have `relrowsecurity` **and** `relforcerowsecurity`.
- **Sparse account** (1 course, 1 task, no history): zero `NaN`/`undefined`/`null` in visible text
  across five routes, and every empty state explains *why* it is empty.

---

## 6. What has NOT been verified — read before trusting anything

### 6.1 The model path has never run
There is no `ANTHROPIC_API_KEY`. The nightly report is produced by the deterministic fallback
(`usedModel: false`) and says so on screen. The failure is now provably *the model call* rather than
an unreachable function — a much narrower gap than before, but still a gap. **Re-verify first when a
key exists.** If a live response shape differs from a fixture, **update the fixture from reality,
never patch the test to pass.**

### 6.2 Accessibility — structural only
A keyboard-only pass on web was done live and found a real invisible-focus bug in `Modal`. Mobile
had a **structural audit** (static props + the Expo-Web ARIA tree), which found three accessible-name
leaks including a Checkbox announcing as *"check, No Instagram before 6 PM"*.

**That is not a VoiceOver pass.** A screen reader tests announcement order, whether a live region
interrupts, and whether a name makes sense *spoken* — none of which a tree can show. **A real
VoiceOver/TalkBack pass on a physical device is a required pre-launch item.**

### 6.3 Failure and offline states
All 9 `(app)` routes have explicit error branches, so the shape is right — **but nobody has ever seen
one fire.** A mid-request database failure was deliberately not tested (two engineers were working
against the same database). **Offline is unimplemented**: the requirement is last-known data with an
explicit staleness timestamp, never silently stale.

### 6.4 Native pickers on mobile
`DatePicker`/`TimePicker` use `@react-native-community/datetimepicker`, which **does not render under
Expo Web** — the tool used for most mobile verification. Every other mobile surface was verified
live; the picker submit path was not. Needs a simulator or device pass.

### 6.5 `/today` issues 45 PostgREST round trips
Invisible locally (131 ms) and **not invisible against cloud Supabase** at 30–50 ms RTT. Not a
classic N+1 — five domain functions each independently re-read the same tables (`calendar_events` ×5,
`deliverables` ×3, `courses` ×2). A partial fix is in progress; see `docs/L11_HARDENING.md` §1.

---

## 7. Before this is production-ready

**Must fix — security** (all four still accurate, re-verified 2026-08-22, `docs/SUPABASE_SETUP.md`):
1. **`collegeos://` is hijackable** — another app registering the scheme can intercept an auth
   callback. Needs Universal Links / App Links, a real domain and an AASA file.
2. **Remove `exp://127.0.0.1:8081/**` from the redirect allow-list.** Development only.
3. **Configure custom SMTP.** The built-in mailer is rate-limited and will silently throttle.
4. **Redirect allow-list must use exact hosts, no wildcards.**

**Must verify:** cloud deploy per `SUPABASE_SETUP.md` · Anthropic activation (§6.1) · a real
VoiceOver pass (§6.2) · the remaining `L11_HARDENING` items.

**Known open items:** `docs/FOLLOWUPS.md` — including S12 (SSRF DNS-rebinding tracked only in a code
comment), **S13** (journal privacy is currently true *by the feature not existing yet*, and must be
re-tested the day journal entries ship), and S14.

---

## 8. Things a future session would otherwise get wrong

Read `.brain/memory/decisions.md` in full — **D1–D22**. The ones most likely to be reversed:

- **D4** — internal packages are source-resolved (no `dist`). A build step reintroduces a stale-dist trap.
- **D16** — `packages/core` is mirrored into the Deno directory; **the staleness guard is
  load-bearing.** A stale mirror means edge functions compute risk with *different logic* than the apps show.
- **D19** — `private.*` functions need an explicit `public` wrapper. Don't "simplify" by exposing the schema.
- **D20** — a component isn't done until something in the **real request path** calls it. This happened
  repeatedly, and at product scale: an entire *verb* (data entry) was missing.
- **D21** — a green `verify` says nothing about what is **committed**.
- **D22** — **in a shared working tree, commit by pathspec** (`git commit -m "…" -- <paths>`). Two agents
  share one git index, so a bare `git commit` sweeps in whatever a peer has staged. This happened.

Also read `.brain/memory/tooling-gotchas.md` — including the two that cost the most: **edge functions
return 503 because no runtime container is running** (`supabase functions serve --env-file`), and
**mobile visual verification works through Expo Web** (`npx expo start --web`), where the simulator's
text-injection corruption simply doesn't exist.

---

## 9. How to work here

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
- Verify before claiming. Paste real output. Typecheck is not evidence.
- **Green once is not green** — run new integration tests twice (D14).
- **Never fabricate a value.** `—` or omit, never a placeholder number. This applies to layout and to
  thresholds too: a page that ends where its content ends is not a defect, and "repeatedly" is not a
  number you get to invent.
- **A doc row is a claim about the past.** Three entries here turned out stale mid-session. Re-verify
  against HEAD before acting on one.
- Behaviour and information may never diverge across platforms; layout and idiom may.
