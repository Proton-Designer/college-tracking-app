# CollegeOS — Project Status

**Always current.** Updated at every layer boundary by the Lead.
Last updated: **2026-08-23**, end of the v2 "Aurora" frontend revamp.

---

## Latest: the frontend is v2 "Aurora" (61 commits, 2026-08-22)

The v1 surface was rejected by the user as *"primal and barebones."* Every one of the 17 web routes
and 18 mobile routes has been converted to a cool iridescent glass language with a floating dark
glass island for navigation. **`docs/DESIGN_LANGUAGE_V2.md` is the visual authority**;
`DESIGN_SYSTEM.md` ("Instrument") is superseded — its structural rules survive, its surface does not.

Both platforms walked a **full end-to-end journey** — mobile's was the first in the project's
history. `npm run verify` exit 0, 362 tests, tree clean. Details and the defects it surfaced:
`HANDOFF.md` §5.1 and §7.4.

**P1 is fixed (2026-08-23).** Confirming a weekly-plan block now creates a real task that Today
sees — proven in Postgres *and* walked end to end on a real iOS device. **Plan reaches Execute for
the first time.** `HANDOFF.md` §2.

**P2 is now the top open item:** a data-layer outage hangs the page rather than erroring, because
every route's error branch is correct and unreachable inside human patience. Its unexplored half
matters more — the mutation-mid-flight case has never been run.

---

## The headline

**The closed loop has a working surface at every step, for the first time.**

```
Observe → Plan → Execute → Detect deviation → Intervene → Reflect → Learn → Update next plan
```

Two of those steps had never executed in the real request path. **Intervene** had four evaluators,
fully tested, with no caller anywhere — the demo account held zero intervention rows. **Learn** let a
user start an experiment and then never measure or score it, and had no decision journal at all.
Both now close, on both platforms.

And the product acquired the verb it was missing entirely: **data entry**. See `HANDOFF.md` §2 for
why that was invisible for so long — every verification ran against a seeded demo account.

---

## Measured state

```
181 commits · 32 migrations · 46 tables · 0 without RLS · 11 edge functions
web: 17 routes · mobile: 16 routes · 23 integration-test files · 8 E2E specs
```

Full regression, run 2026-08-22, every number below executed rather than recalled:

| Suite | Result |
|---|---|
| `npm run verify` | **PASS** — 4 guards, typecheck ×5 workspaces, lint, **354 unit tests** (core 335 · api 17 · mobile 2) |
| pgTAP | **459 assertions**, 10 files |
| `packages/api` integration (real DB) | **101 / 101**, twice consecutively (D14) |
| Deno edge, offline | **86 / 86** |
| Deno edge, live DB | **60 / 60**, twice consecutively |
| Playwright E2E, desktop + mobile | **28 / 28**, twice, at `--workers=2` |

Playwright was deliberately run at `--workers=2` rather than `1`: single-worker would have hidden a
real locator ambiguity that only appears under concurrent timing. The setting that makes a suite pass
is not always the setting that makes it useful.

`npm run verify` → **exit 0**. Four guards run before typecheck; each has caught a real defect.

**Production bundle, measured:** 1,264 KB raw / **348 KB gzipped** across 18 routes. A full day of
new UI cost **+0.6 KB gzipped** — server-components-by-default doing its job.

---

## Landed this session

**Data entry & onboarding (E0–E5)** — course/assignment/task CRUD, weight categories, grade
boundaries, deliverable detail with backplan generation, syllabus upload → extract → confirm,
Brightspace ICS confirmation, and an onboarding gate that checks for a real course rather than a
flag. **Acceptance test passing on both platforms:** brand-new account → populated Today, no psql,
no seed.

**Loop completion** — U1 interventions · U3 proof-of-work · U5 office hours · U6 weekly planning ·
U7 decision journal · U9 experiment measurement and scoring.

**Correctness** — B1/B2 (course detail 500'd on every real course) · **B4** (day boundaries derived
from UTC across 15 sites) · B6 (all-day events counted as 24h of committed time) · T1/T2 (Recovery
Mode named nothing and removed all agency) · R1 · V1 (night-review voice, from the brief) · R2.

**Design** — L13.0 primitives (motion, depth, five states, `PageHeader`, `Modal`, `Select`,
Date/TimePicker) and L13.1 composition on both platforms.

**Hardening** — production perf measured for the first time · security review · sparse-account pass ·
structural accessibility audit · RLS guard fixed so it can actually fail.

---

## In flight
- **NOVA** — the full manual user journey, both platforms (L11 §5).
- **ATLAS** — L14 §5 full regression.

## Remaining, doable here
- A mid-request database-failure test — the last untested failure mode. Needs a window when nobody
  else is using the database.

## Deferred deliberately (with reasons, not forgotten)
- **Offline** — "last-known data with a staleness timestamp" is a caching *feature*, not a hardening
  task. Building it late and unproven would be worse than shipping without it and saying so.
- **U5's contextual surfacing** and **U8** — both need a real rule or real data, not effort.
  "Repeatedly" is not a threshold anyone gets to invent.
- **`computeRiskAssessment`'s shared read** — 9 callers; churn at 8 sites for a gain at 1. Shape
  filed, not scheduled.

## Blocked (not on us)
- **Cloud deploy** — `docs/SUPABASE_SETUP.md`, including four must-fix-before-launch security items.
- **Anthropic key** — the model path has never run. The nightly report is produced by the
  deterministic fallback and says so on screen.
- **A physical device** — real VoiceOver/TalkBack, and the native date/time picker submit path.

## Key reference
`HANDOFF.md` · `docs/FOLLOWUPS.md` · `docs/L11_HARDENING.md` · `docs/L13_DESIGN_PASS.md` ·
`docs/E0_ONBOARDING_SPEC.md` · `.brain/memory/decisions.md` (D1–D22) ·
`.brain/memory/tooling-gotchas.md`
