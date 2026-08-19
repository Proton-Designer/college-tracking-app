# CollegeOS — Master Build Plan

> Source of truth for the autonomous build. Owner: Opus Lead (COO/architect).
> Derived from `docs/context/SOURCE_BRIEF.txt` ("Building a College Accountability Engine with Claude").

---

## 1. What we are building

**CollegeOS** — a personal *closed-loop operating system* for a college student. Not a habit
tracker with AI commentary.

The loop:

```
Observe → Plan → Execute → Detect deviation → Intervene → Reflect → Learn → Update next plan
```

**Governing rule (from the brief):**
> Every data point should either change a decision, trigger an intervention, improve a
> prediction, or be removed.

**North-star metric:** *Did CollegeOS increase the percentage of high-value intentions that
became completed actions?*

### The hard architectural line

- **Postgres is the system of record.** Not Claude, not Notion.
- **Deterministic code does all calculation** — streaks, completion rates, risk scores, grade
  projections, lateness, rolling averages, calibration factors, free-time detection.
- **Claude does only interpretation** — prioritization, reflection, hypothesis generation,
  coaching, challenging rationalizations, generating interventions.
- **Claude always returns typed, schema-validated JSON.** Never free-form essays into the UI.

---

## 2. Platform decision (overrides the brief)

The brief proposed Next.js web + native SwiftUI iOS. The user requires **React Native mobile +
web app, same app, two platforms**. Decision:

**Monorepo with a shared domain core and two native-quality UI shells.**

```
collegeos/
├── apps/
│   ├── web/        Next.js 15 App Router + TS + Tailwind v4 + Framer Motion
│   └── mobile/     Expo SDK 54 + Expo Router + TS + Reanimated 3
├── packages/
│   ├── core/       Pure TS domain engine. ZERO React. 100% unit-tested.
│   ├── api/        Typed Supabase data-access layer. Shared by both apps.
│   ├── design/     Design tokens (color/type/space/motion/elevation) as plain TS.
│   └── config/     Shared tsconfig / eslint / prettier
├── supabase/
│   ├── migrations/ Ordered SQL. Applies identically to local and cloud.
│   ├── functions/  Deno Edge Functions (all Anthropic calls live here)
│   ├── tests/      pgTAP RLS + constraint tests
│   └── seed.sql
└── docs/
```

### Why two UI shells instead of one universal Expo app

- The user asked for a **desktop landing page** and a **mobile welcome screen** — genuinely
  different surfaces with different craft requirements.
- Web needs SEO, real desktop information density, and CSS-grade motion. `react-native-web`
  compromises all three.
- **Divergence risk is the real cost.** Mitigated by: all business logic in `packages/core`
  (neither app may compute anything), all data access in `packages/api`, all visual constants in
  `packages/design`. UI shells own layout and interaction only.

### Why Supabase Edge Functions, not Next.js API routes

Mobile needs the same backend as web. Edge Functions serve both from one place and keep the
Anthropic key server-side. Next.js route handlers would force a second backend for mobile.

---

## 3. Working without Supabase credentials

Credentials arrive later. Strategy:

1. **Run Supabase locally via Docker** (`supabase start`). Real Postgres, real GoTrue auth, real
   RLS, real Storage, real Edge Function runtime. We build and test against the real thing.
2. Every schema change is an **ordered, idempotent-safe migration** in `supabase/migrations/`.
3. `docs/SUPABASE_SETUP.md` is a **complete, ordered runbook**: every dashboard toggle, secret,
   OAuth redirect URL, storage bucket, cron schedule, and CLI command — so that when credentials
   land, the cloud project is provisioned exactly and in one pass.
4. Apps read config from env with a single `packages/api/src/env.ts` gate. Swapping local → cloud
   is changing two env vars.

---

## 4. Design direction (non-negotiable constraints)

Light theme. Must **not** read as a templated AI-generated app.

**Banned defaults (the "AI app" tells):**
- Purple/indigo→blue gradient hero, glassmorphism everywhere
- Emoji as section headers or in UI chrome
- `rounded-3xl` cards with big soft drop-shadows stacked on a `#F9FAFB` page
- Generic Inter-everything at one weight, centered marketing copy with a sparkle icon
- Random pastel "feature card" grids

**Direction:** a *precision instrument*, editorially typeset. Warm paper-white ground (not pure
white), true ink text, one confident accent, hairline rules instead of shadows for separation,
data-dense but calm, generous vertical rhythm. Motion is fast, physical, and purposeful
(150–250ms, spring-based on mobile) — never decorative.

Final design language is produced by Engineer B in Phase 0 with real-world reference research,
then ratified by the Lead into `packages/design` + `docs/DESIGN_SYSTEM.md`.

---

## 5. Feature scope (full — from the brief)

### Core loop
- Morning check-in (energy, mood, Top 3 MITs, completion probability prediction, likely
  derailment reason, kill-list commitments) — pre-filled, ~1 min
- Night review (auto-populated actuals + short reflection + structured failure reasons)
- Daily prediction scored at night (calibration training)

### Semester intelligence
- Semester Map per course (meetings, office hours, exams, assignments, weights, late policy,
  attendance policy, grade boundaries, difficulty, target grade, confidence)
- Syllabus ingestion → structured extraction → **mandatory human confirmation** before any
  deadline is saved
- **Deadline Radar** — backward-planned milestone chains, not single alerts
- **Academic risk engine** — deterministic multi-factor score with a full explanation trace
- **Grade scenario planner** — "to reach 90 you need ≥92 on Exam 3"
- Office-hours intelligence (surfaced contextually on repeated confusion)

### Execution
- Task duration prediction + actual → **personal calibration multipliers per task category**
- Focus sessions (planned/actual duration, start delay, interruptions, subjective focus,
  objective output)
- **Proof-of-work** requirements on high-stakes tasks
- Three workload levels: **Floor / Target / Stretch**
- **Minimum Viable Day** (Recovery Mode) auto-detection to stop failure cascades

### Behavior
- **Kill Loop**: behavior → trigger → urge → action → immediate reward → long-term cost →
  replacement behavior, plus if-then implementation intentions
- **Friction logging** — one-tap "why did this fail?" → a database of failure causes
- **Bounce-back score** — time-to-recovery after failure, explicitly favored over streaks
- **Commitment escalation** ladder L0→L4
- **Decision journal** with predictions scored later

### Intelligence
- Nightly analysis: **one Claude call, many lenses** (Executive Coach, Academic Strategist,
  Behavior Analyst, Skeptic, Systems Engineer, Motivator, Recovery Coach)
- Weekly synthesis (incl. a **System Failure** section: what about CollegeOS itself isn't working)
- Longitudinal analyst (monthly), semester retrospective
- **Insights with a confidence hierarchy** (High / Medium / Testing) — never presents patterns as fact
- **Experiments** — observation → hypothesis → N-of-1 trial → measured outcome
- Summary pyramid: raw events → daily → 7-day → 30-day → semester durable lessons
- Cost controls: token logging, hard monthly ceiling, model routing (Haiku extract / Sonnet
  reason / Opus rare), prompt caching of stable context

### Interventions
- Exception-based notifications only (never motivational spam)
- Contextual nudges with one-tap behavioral capture
- Scheduled focus-mode activation from learned trigger windows

### Integrations
- **WHOOP** (OAuth2 + webhooks) — sleep, recovery, HRV, strain, workouts
- **Brightspace iCal feed** + syllabus upload (API access not assumable as a student)
- **Calendar** (ICS + Google/Microsoft later)
- **RescueTime**
- Generic `telemetry_events` table so new sources need no schema rebuild
- Screen Time / HealthKit: interfaces only (native iOS work is out of scope this session, but
  the ingestion contract is built and documented)

---

## 6. Build layers (each fully tested before the next begins)

| # | Layer | Owner | Exit criteria |
|---|-------|-------|---------------|
| **L0** | Foundation: monorepo, tooling, local Supabase up, design system ratified | Lead + both | `npm run verify` green; design tokens ratified |
| **L1** | Data model: full schema, RLS, migrations, seed, generated types, SETUP doc | Eng A | pgTAP RLS suite green; cross-user isolation proven |
| **L2** | Domain engine `packages/core`: risk, grades, calibration, backplan, bounce-back, MVD, scheduling | Eng A | ≥95% coverage; property/edge-case tests green |
| **L3** | Auth + app shells: sign up/in/reset, session, guards, landing page, welcome screen | Eng B | Playwright auth E2E green; mobile sim auth flow verified |
| **L4** | Core loop: Today, morning check-in, night review, tasks | Both | E2E full-day cycle on web + mobile |
| **L5** | Courses, syllabus ingestion + confirmation, deadline radar, grade scenarios | Both | E2E; extraction never auto-saves |
| **L6** | Focus sessions, kill loop, friction logging, proof-of-work | Both | E2E |
| **L7** | Claude layer: edge functions, nightly/weekly, structured output, cost ceiling | Eng A | Contract tests + schema-validation + budget-breach tests |
| **L8** | Insights, experiments, decision journal, retrospectives | Both | E2E |
| **L9** | Interventions, notifications, commitment escalation, MVD/recovery mode | Both | E2E |
| **L10** | Integrations: WHOOP, Brightspace iCal, calendar, RescueTime | Eng A | Mock-server contract tests green |
| **L11** | Hardening: perf, a11y, offline, error states, security review, full regression | Both | Full E2E suite + audits green |

**Rule:** no layer starts until the previous layer's exit criteria are demonstrated with
*evidence* (test output pasted, screenshots captured), not asserted.

---

## 7. Team & coordination

- **Lead (Opus)** — architecture, decisions, review, red-teaming, integration, final QA gate.
- **Engineer A (Sonnet) — `atlas`** — backend, data model, domain engine, edge functions,
  integrations, test infrastructure.
- **Engineer B (Sonnet) — `nova`** — design system, web app, mobile app, UI/UX, motion,
  accessibility, visual QA.
- **Specialists** dispatched as needed: `bug-auditor`, `test-commander`, `feature-adversary`,
  `precision-tester`, `root-cause-investigator`, `frontend-specialist`, `sim-pilot`.

**Anti-deadlock protocol:** every engineer must return a report at the end of each assignment
rather than waiting for a peer. The Lead runs a heartbeat loop so the session never idles. No
agent may block waiting on another agent — all cross-engineer dependencies route through the Lead.

**Knowledge base:** `.brain/` (agent-brain) is installed once L0 structure exists and refreshed at
every layer boundary. Durable decisions land in `.brain/memory/decisions.md` so context
compaction cannot lose them. `docs/STATUS.md` is the always-current project state.

---

## 8. Definition of done

- Both apps build clean, typecheck clean, lint clean.
- Domain engine unit tests green with high coverage.
- RLS tests prove no cross-user data access.
- Playwright E2E green for every user-facing flow on web.
- Mobile flows verified on the iOS simulator with screenshot evidence.
- `docs/SUPABASE_SETUP.md` is complete enough that a fresh cloud project can be provisioned in
  one ordered pass.
- No secrets in the repo. No journal content in client logs.
- Every feature in §5 implemented or explicitly documented as deferred with rationale.
