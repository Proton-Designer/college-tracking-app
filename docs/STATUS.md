# CollegeOS — Project Status

**Always current.** Updated at every layer boundary by the Lead.
Last updated: **2026-08-22**, mid-L12/L13.

---

## The headline

The build is **not** in a wrap-up state. A reachability audit plus a live walkthrough as an empty
account found that **the product has no data-entry path** — no way to create a course, a task, or an
assignment, and no onboarding at all. See `FOLLOWUPS.md` **E1–E5** and `docs/E0_ONBOARDING_SPEC.md`.

Everything previously verified was verified against the **seeded demo account**. *"All screens
render correctly"* was proven and remains true. *"A user can actually use this"* was never asked,
and the answer is no. Closing that is the current priority.

---

## Verified state

| Suite | Count |
|---|---|
| `packages/core` unit | **332** |
| pgTAP (RLS, constraints, triggers) | **356+** (new: `08_course_archive`) |
| `packages/api` integration (live DB) | 75+ |
| Deno edge (offline, no API key) | 84 |
| Web E2E (Playwright, real stack) | 17 |

Four guards run **before** typecheck and every one has caught a real defect:
`check:imports` · `check:core-mirror` · `check:barrel-exports` · `check:demo-clean`.

**46 tables · 0 without RLS · 11 edge functions · 21 recorded decisions · 30+ migrations**

---

## In flight

- **ATLAS** (`qtqzxwut`) — **L12A, data entry.** Landed: UTC-midnight straddle fix in
  planning-vs-execution start delay; `courses.archived_at` + 6-site read-path audit. In progress:
  nullable `predicted_completion_pct` migration, deliverable CRUD. Then grade-category/boundary CRUD,
  `updateCourse`/`updateTask`/`deleteTask`, and client wrappers for `syllabus-confirm` /
  `brightspace-confirm` (**no edge function is currently app-reachable except `account-delete`**).
- **NOVA** (`8h36nekc`) — **L13.0 complete** (5 commits: motion/press states, Panel depth, 5-state
  audit + bare-`Pressable` sweep, `PageHeader`, tab-bar active indicator). In progress: form/modal
  primitive + date/time picker — the last thing blocking Atlas's UI phase.

## Queued

| Owner | Work |
|---|---|
| Nova | **T1/T2** Recovery Mode (names nothing it kept; removes every action) → **U6** weekly planning UI → **L13.1** screen composition |
| Atlas | Onboarding + CRUD UI (E0–E5) → **U3** proof-of-work → **U7 + U9** decision journal & experiment scoring (one piece of work) |
| Unassigned | **U1** interventions surface · **U5** office hours · **U8** semester lessons · **S9** WHOOP notification→fetch wiring |

## Then: L14 hardening
`docs/L11_HARDENING.md` — performance against a **production** build (never measured), keyboard +
VoiceOver accessibility, sparse/failed/offline states, full regression, complete manual journey on
both platforms.

---

## Blocked on credentials (not on us)
- **Supabase cloud** — `docs/SUPABASE_SETUP.md`, including **four must-fix-before-launch security
  items**.
- **Anthropic API key** — LLM layer complete and offline-tested. The nightly report currently
  discloses this honestly on screen (*"No ANTHROPIC_API_KEY configured — deterministic report
  only"*), which is the behaviour we want. On activation: if a live response shape differs from a
  fixture, **update the fixture from reality, never patch the test to pass.**

## Key reference
`HANDOFF.md` · `docs/L12_COMPLETION_PLAN.md` · `docs/E0_ONBOARDING_SPEC.md` ·
`docs/L13_DESIGN_PASS.md` · `docs/L11_HARDENING.md` · `docs/FOLLOWUPS.md` ·
`.brain/memory/decisions.md` (D1–D21) · `.brain/memory/tooling-gotchas.md`
