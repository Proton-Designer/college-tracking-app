# CollegeOS — Project Status

**Always current.** Updated at every layer boundary by the Lead.
Last updated: **2026-08-23**. Numbers below were executed on that date, not recalled.

> **`HANDOFF.md` is the full picture** — feature inventory, new-machine bootstrap, Supabase
> migration story, everything remaining, and the recurring problems this build kept hitting.
> This file is the one-screen summary.

---

## Measured state

```
270 commits · 33 migrations · 46 tables · 0 without RLS · 11 edge functions
web: 17 routes · mobile: 16 routes · 8 E2E specs · 23 api integration files
```

| Suite | Result | When |
|---|---|---|
| `npm run verify` | **PASS (exit 0)** — 4 guards, typecheck ×5, lint, **383 tests** (core 351 · api 30 · mobile 2) | 2026-08-23 |
| pgTAP | **PASS — 463 assertions, 11 files** | 2026-08-23 |
| `packages/api` integration (real DB) | 101 / 101, twice (D14) | 2026-08-22 |
| Deno edge, offline / live DB | 86 / 86 · 60 / 60 | 2026-08-22 |
| Playwright E2E | 28 / 28, twice, `--workers=2` — **but see G2** | 2026-08-22 |
| Production bundle | 1,264 KB raw / **348 KB gzipped**, 18 routes | 2026-08-22 |

---

## The headline

**The closed loop has a working surface at every step, and Plan now reaches Execute.**

```
Observe → Plan → Execute → Detect deviation → Intervene → Reflect → Learn → Update next plan
```

**P1 fixed (2026-08-23).** Confirming a weekly-plan block creates a real task that Today sees —
proven in Postgres *and* walked end to end on a real iOS device.

**The frontend is v2 "Aurora."** All 17 web routes and all 16 mobile routes converted to a cool
iridescent glass language with a floating dark glass island for mobile navigation.
**`docs/DESIGN_LANGUAGE_V2.md` is the visual authority**; `DESIGN_SYSTEM.md` ("Instrument", v1) is
superseded — its structural rules survive, its surface does not.

---

## Top of the queue

1. 🔴 **P2's live pass.** The 10s REST timeout is written and unit-tested (13 tests, `1e9a49b`).
   The live pass is unrun, and **the mutation-mid-flight case has never been run on any platform** —
   run that one first. A failed read is visible; a write that appears to succeed costs real data.
2. 🔴 **The web responsive shell.** Sidebar ≥1024 / collapsed rail 768–1023 / island <768.
   Designed and ruled, not built. Screenshots at 1440 / 1024 / 768 / 390 before proceeding.
3. 🟡 P1's web half · the `derivePlannedMits` swap on web · G4's ten remaining a11y files ·
   S5 (no stale-task surface) · S1/S2/S8/G2 (shared-mutable test state).

---

## Blocked (not on us)

- **Cloud deploy** — `docs/SUPABASE_SETUP.md`, including **four must-fix-before-launch security
  items** (`collegeos://` hijackable · the `exp://` redirect entry · custom SMTP · exact-host
  allow-list).
- **Anthropic key** — the model path has never run. The nightly report comes from the deterministic
  fallback and says so on screen.
- **A physical device** — real VoiceOver/TalkBack, and a real Android device (G1: `expo-blur` never
  blurs on Android, so the glass effect does not exist there).

## Deferred deliberately (with reasons, not forgotten)

- **Offline** — "last-known data with a staleness timestamp" is a caching *feature*, not a hardening
  task. Building it late and unproven would be worse than shipping without it and saying so.
- **U5's contextual surfacing** and **U8** — both need a real rule or real data, not effort.
  "Repeatedly" is not a threshold anyone gets to invent.
- **`computeRiskAssessment`'s shared read** — 9 callers; churn at 8 sites for a gain at 1.

---

## Key reference

`HANDOFF.md` · `docs/FOLLOWUPS.md` · `docs/SUPABASE_SETUP.md` · `docs/DESIGN_LANGUAGE_V2.md` ·
`docs/L11_HARDENING.md` · `docs/DATA_MODEL.md` · `.brain/memory/decisions.md` (D1–D22) ·
`.brain/memory/environment.md` · `.brain/memory/versions.md` · `.brain/memory/tooling-gotchas.md`
