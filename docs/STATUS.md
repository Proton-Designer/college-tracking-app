# CollegeOS — Project Status

**Always current.** Updated at every layer boundary by the Lead.

## Verified state (all green)

| Suite | Count |
|---|---|
| `packages/core` unit | **194** |
| `packages/api` unit | 17 |
| `packages/api` integration (live DB) | 50 |
| pgTAP (RLS, constraints, triggers) | **265** |
| Deno edge (offline, no API key) | 45 |
| Web E2E (Playwright, real stack) | 17 |

`npm run verify` → exit 0. Guards in the chain: `check:imports`, `check:core-mirror`.

## Built

**Backend (L0–L7 complete)**
- 14 migrations · 41 tables · RLS on every user-scoped table (dynamically enumerated in tests)
- `packages/core` — the whole deterministic engine: risk + explanation traces, grade projection
  & scenario solver, duration calibration, backplanning, bounce-back, Recovery Mode, workload
  levels, planning-vs-execution, friction analytics, insight confidence gating
- `packages/api` — typed data layer, auth (enumeration-safe), day assembly, academic, focus
  sessions, kill loop, friction, proof-of-work
- Edge functions: `syllabus-extract`, `syllabus-confirm`, `nightly-analysis`, `weekly-synthesis`
- LLM gateway: budget gate proven to block *before* the HTTP call, Zod validation, retry ladder,
  deterministic fallback. **Fully tested offline — no `ANTHROPIC_API_KEY` needed or present.**

**Web** — `/` landing · auth (login/signup/forgot/reset/confirm) · `/today` · `/courses` ·
`/courses/[id]` Semester Map · `/calendar` horizon · `/review` · `/design` preview

**Mobile** — welcome · auth (login/signup/forgot/reset/callback) · `/today` (all three modes) ·
`/review` · `/design` preview

## In flight
- **ATLAS** (`qtqzxwut`): L8 backend — experiments (testing-tier insight → N-of-1 trial),
  decision journal, semester retrospective
- **NOVA** (`8h36nekc`): night-review preview + prediction wiring → **navigation shell** →
  mobile parity (Courses, Semester Map, Calendar)

## Biggest known gap
**No navigation.** Every screen above exists and works, but there is no way to move between them —
the product is currently a set of URLs, not an application. This is Nova's priority after the
night review.

## Not yet built
`/insights` · `/settings` · `/focus/[sessionId]` · `/review/[date]` history · mobile Courses /
Semester Map / Calendar · L9 interventions & notifications · L10 integrations (WHOOP, Brightspace
iCal, RescueTime, calendar) · L11 hardening pass

## Blocked on credentials (not on us)
- **Supabase cloud** — everything is built and tested against a local stack; `docs/SUPABASE_SETUP.md`
  is the ordered provisioning runbook, including four must-fix-before-launch security items.
- **Anthropic API key** — the LLM layer is complete and offline-tested. `SUPABASE_SETUP.md` §7 has
  the 5-step activation checklist, including: if a live response shape differs from a fixture,
  **update the fixture from reality, never patch the test to pass.**

## Key reference
`CLAUDE.md` · `docs/MASTER_PLAN.md` · `docs/DOMAIN_ENGINE_SPEC.md` · `docs/LLM_LAYER_SPEC.md` ·
`docs/DESIGN_SYSTEM.md` · `docs/SCREEN_SPEC.md` · `docs/DATA_MODEL.md` · `docs/SUPABASE_SETUP.md` ·
`docs/FOLLOWUPS.md` · `.brain/memory/decisions.md` (D1–D17)
