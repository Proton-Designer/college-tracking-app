# CollegeOS — Project Status

**Always current.** Updated at every layer boundary by the Lead.

## Current layer
**L1 — Data model** (Atlas) · **Design system implementation** (Nova)

## Complete
- **L0 Foundation** — monorepo (npm workspaces), all packages source-resolved (D4)
- **`packages/core` domain engine** — all 10 DOMAIN_ENGINE_SPEC sections, **171 tests**,
  98.75% stmts / 93.62% branch. Anti-excuse invariant enforced at import time.
- **App shells** — `apps/web` (Next 16.3.1 + Tailwind v4), `apps/mobile` (Expo SDK 57 + Router),
  cross-boundary types proven flowing through both bundlers
- **Test infrastructure** — Playwright (desktop + mobile viewports, isolated per-spec users,
  Mailpit integration), Jest + RNTL, repeatable `scripts/sim-shot.sh`
- **Design system ratified** — `docs/DESIGN_SYSTEM.md`, direction **"Instrument"**, all contrast
  ratios computed

## In flight
- **ATLAS** (`mapw9to2`): L1 — schema, RLS, pgTAP, seed, generated types, `docs/DATA_MODEL.md`
- **NOVA** (`a9bsul1i`): `packages/design` + core primitives on both platforms + preview surfaces

## Blocked / waiting
- Supabase **cloud** credentials not yet provided. Building against local stack.
  All cloud-only steps accumulate in `docs/SUPABASE_SETUP.md`.

## Next (per MASTER_PLAN §6)
L3 auth + landing/welcome → L4 core loop → L5 courses/syllabus → L6 focus/kill loop →
L7 Claude layer → L8 insights/experiments → L9 interventions → L10 integrations → L11 hardening

## Key reference
`CLAUDE.md` · `docs/MASTER_PLAN.md` · `docs/DOMAIN_ENGINE_SPEC.md` · `docs/LLM_LAYER_SPEC.md` ·
`docs/DESIGN_SYSTEM.md` · `docs/SUPABASE_SETUP.md` · `.brain/memory/decisions.md`
