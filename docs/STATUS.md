# CollegeOS — Project Status

**Always current.** Updated at every layer boundary by the Lead.

## Verified state

| Suite | Count |
|---|---|
| `packages/core` unit | **332** |
| pgTAP (RLS, constraints, triggers) | **356** |
| `packages/api` integration (live DB) | 70+ |
| Deno edge (offline, no API key) | 50+ |
| Web E2E (Playwright, real stack) | 17 |

`npm run verify` → exit 0. Four guards run **before** typecheck, and every one has caught a real
defect: `check:imports` · `check:core-mirror` · `check:barrel-exports` · `check:demo-clean`.

**73 commits · 27 migrations · 46 tables · 0 without RLS · 11 edge functions · 21 recorded decisions**

---

## Complete

**Backend (L0–L10 + user-rights & planning)**
- Full deterministic domain engine in `packages/core` — risk with explanation traces, grade
  projection & scenario solver, duration calibration, backplanning, bounce-back, Recovery Mode,
  workload levels, planning-vs-execution, friction analytics, insight confidence gating,
  experiment outcome scoring, weekly planning with free-interval math
- `packages/api` — typed data layer, enumeration-safe auth, day assembly, academic, focus sessions,
  kill loop, friction, proof-of-work, interventions, escalation
- Edge functions — syllabus extract/confirm, nightly analysis, weekly synthesis, Brightspace
  sync/confirm, WHOOP OAuth + webhook, RescueTime sync, account export, account delete
- LLM layer complete and **fully tested offline** — budget gate proven to block *before* the HTTP
  call, forced tool-use + Zod validation, retry→deterministic-fallback ladder, seven-lens schema
- Integrations: Brightspace iCal (end-to-end proven), WHOOP, RescueTime — all provider-behind-
  interface, contract-tested against recorded fixtures
- **Data export & deletion** — dynamically enumerates all 46 user-scoped tables; deletion also
  removes Vault secrets and Storage objects a row cascade would miss

**Both platforms (web + mobile, full parity)**
Landing/welcome · auth (5 routes) · Today (3 engine-decided modes, Day Trace) · morning check-in ·
night review · Courses · Semester Map · Calendar horizon · Review + `/review/[date]` report ·
Insights · focus sessions · kill list · nav shell

---

## In flight
- **ATLAS** (`qtqzxwut`): `/settings` both platforms — profile/timezone, kill-habit definitions +
  escalation ceiling (closes U4), export/delete UI, integrations, LLM budget
- **NOVA** (`8h36nekc`): mobile on-device verification of `/review/[date]`, then **U1 — the
  interventions surface** (Today inline + history)

## Remaining
- **U1** interventions surface · **U3** proof-of-work UI · **U5** office hours (see `FOLLOWUPS.md`)
- **L11 hardening** — see `docs/L11_HARDENING.md`. Verification and repair only, no new features.

---

## Blocked on credentials (not on us)
- **Supabase cloud** — everything built and tested against a local stack. `docs/SUPABASE_SETUP.md`
  is the ordered provisioning runbook, including **four must-fix-before-launch security items**.
- **Anthropic API key** — LLM layer complete and offline-tested. §7 has the activation checklist,
  including: if a live response shape differs from a fixture, **update the fixture from reality,
  never patch the test to pass.**

## Key reference
`CLAUDE.md` · `docs/MASTER_PLAN.md` · `docs/DOMAIN_ENGINE_SPEC.md` · `docs/LLM_LAYER_SPEC.md` ·
`docs/DESIGN_SYSTEM.md` · `docs/SCREEN_SPEC.md` · `docs/DATA_MODEL.md` · `docs/SUPABASE_SETUP.md` ·
`docs/L11_HARDENING.md` · `docs/FOLLOWUPS.md` · `.brain/memory/decisions.md` (D1–D21)
