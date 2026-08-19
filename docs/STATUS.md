# CollegeOS — Project Status

**Always current.** Updated at every layer boundary by the Lead.

## Current layer
**L5 web — courses & semester intelligence** (Nova) · **L3 mobile — auth** (Atlas, verifying)

## Complete
- **L0 Foundation** — monorepo (npm workspaces), all packages source-resolved (D4)
- **`packages/core` domain engine** — all 10 DOMAIN_ENGINE_SPEC sections, **171 tests**,
  98.75% stmts / 93.62% branch. Anti-excuse invariant enforced at import time.
- **App shells** — `apps/web` (Next 16.3.1 + Tailwind v4), `apps/mobile` (Expo SDK 57 + Router),
  cross-boundary types proven flowing through both bundlers
- **Test infrastructure** — Playwright (desktop + mobile viewports, isolated per-spec users,
  Mailpit integration), Jest + RNTL, repeatable `scripts/sim-shot.sh`
- **Design system ratified + implemented** — direction **"Instrument"**; `packages/design`
  tokens, primitives on both platforms, `/design` preview. 3 review passes.
- **L1 data model** — 41 tables, 46 RLS policies, **261 pgTAP assertions**, realistic seeded
  semester, generated types
- **L3 backend** — SSR + native clients, enumeration-safe auth, hardened profile trigger,
  typed data layer, live-stack integration tests
- **L3 web** — landing page, auth flows, route protection; **17/17 E2E** against the real stack
- **L4 backend** — day-assembly service; engine meets real data (BME 301 = 87.0833% agrees
  across engine, DB, and API)
- **L4 web** — Today screen on real data: Day Trace signature element, all three modes,
  morning check-in, full state matrix
- **L5 backend** — LLM gateway (offline-tested, no API key needed), syllabus ingestion with
  proven confirmation gate + prompt-injection test, deadline radar, grade scenarios

## In flight
- **NOVA** (`a9bsul1i`): L5 web — /courses index, Semester Map with risk trace, grade
  scenario planner, deadline horizon, syllabus confirmation screen
- **ATLAS** (`mapw9to2`): L3 mobile — welcome + auth flows, verifying on simulator;
  then seed coverage for 2026-07-28 so the MVD kept/deferred path produces real output

## Blocked / waiting
- Supabase **cloud** credentials not yet provided. Building against local stack.
  All cloud-only steps accumulate in `docs/SUPABASE_SETUP.md`.

## Next (per MASTER_PLAN §6)
L3 auth + landing/welcome → L4 core loop → L5 courses/syllabus → L6 focus/kill loop →
L7 Claude layer → L8 insights/experiments → L9 interventions → L10 integrations → L11 hardening

## Key reference
`CLAUDE.md` · `docs/MASTER_PLAN.md` · `docs/DOMAIN_ENGINE_SPEC.md` · `docs/LLM_LAYER_SPEC.md` ·
`docs/DESIGN_SYSTEM.md` · `docs/SUPABASE_SETUP.md` · `.brain/memory/decisions.md`
