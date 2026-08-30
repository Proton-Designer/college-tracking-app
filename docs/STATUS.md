# Ihsan — Project Status

**Last updated: 2026-08-30 (the merge build).** Numbers executed, not recalled.

> **Start here:** `docs/IHSAN_BUILD_REPORT.md` — what was built, what was left, what bit.
> Then `docs/CONNECTION_CHECKLIST.md` (everything to plug in, in order) and
> `docs/VALIDATION_PLAN_IHSAN.md` (how to test it).
>
> The reasoning behind the merge is `docs/IHSAN_RECONCILIATION.md`; the rulings are
> `.brain/memory/decisions.md` D27–D43. `HANDOFF.md` remains the deep machine-setup reference.

---

## What this is now

CollegeOS, LifeOS and ULM merged into one app, plus a new pillar:

```
Today   do the day          Learn   acquire and retain
Life    the terrain         Self    who this is for
Review  what happened       Vision  the chain above the War Map
```

The learning pillar is a **port** of Ayman's ULM (github.com/Proton-Designer/ULM), not a
rebuild — `docs/ULM_ADRS.md` carries his eleven ADRs with our overrides noted, and
`docs/IHSAN_ADDENDUM.md` §1 is the reconciliation.

Five life domains — Deen · Business · School · Fitness · Work — each a lens over shared
primitives rather than a silo.

---

## Measured state

```
65 migrations, ALL APPLIED to jcikqbxwjmdduwprixpy · 108 tables · 0 without RLS (verified live)
23 edge functions · web: 32 route groups · mobile: 5 tabs + 28 screens
```

| Suite | Result | When |
|---|---|---|
| `npm run verify` | **PASS (exit 0)** — 4 guards, typecheck ×5, lint, **727 tests** (core 687 · api 40) | 2026-08-30 |
| Deno (`deno test -A`) | **PASS — 323**, twice consecutively per D14 (was 133 before the merge) | 2026-08-30 |
| `next build` | clean, every route | 2026-08-30 |
| RLS audit, migrations 51–58 | every new table: enable + force + owner-scoped policy (34 policies) | 2026-08-30 |
| Schema applied + types regenerated | **DONE** — 48–65 pushed; `db:types:cloud` found 2 real transcription errors, both fixed | 2026-08-30 |
| RLS on the live database | **108 tables, 0 without RLS, 0 without force** — queried, not inferred from migrations | 2026-08-30 |
| pgTAP · E2E · api integration | **NOT RUN** — needs Docker | — |

---

## Blocked on a person, not on code

1. ~~Apply migrations and regenerate types~~ — **DONE 2026-08-30.** The regeneration earned its
   place: it caught a phantom `sunnah_slot` column on `task_sessions` and a missing
   `llm_usage_log.provider`, neither of which any gate could see.
2. **Settings, per user** — prayer location and method, baselines, signal domains, Learn limits.
   Until then every affected surface shows an honest empty state rather than a number.
3. **Canvas connect** (still owed from the previous handover, ~10 minutes).
4. **`VOYAGE_API_KEY`** — the one new credential. Learn works without it; embeddings stay null and
   the merge pass falls back to lexical similarity (D41).
5. **Raise the LLM ceiling $5 → $25** at first ingestion, then validate cost on three real books
   before optimising anything.
6. **Ayman's list**: L1–L3, the Ihsan domain, WHOOP, pgTAP, App Store Connect, TestFlight.
   The bundle id is still deliberately unset and is permanent at first submission (D43).
