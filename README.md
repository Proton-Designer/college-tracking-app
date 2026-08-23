# CollegeOS

A personal **closed-loop operating system** for a college student. Not a habit tracker.

```
Observe → Plan → Execute → Detect deviation → Intervene → Reflect → Learn → Update next plan
```

---

## Setup

Docker must be running first (`open -a Docker` on macOS).

```bash
git clone https://github.com/Proton-Designer/college-tracking-app College-app
cd College-app
npm run bootstrap    # prerequisites, npm install, git hook, local Supabase, all four .env.local files

npm run db:reset     # 33 migrations + seed.sql
npm run db:types     # regenerate the typed database client
npm run verify       # 4 guards → typecheck → lint → 383 tests. Must exit 0.
```

Then, in separate terminals:

```bash
supabase functions serve --env-file ./.env.local   # edge runtime — NOT part of db:start
npm run dev --workspace=@collegeos/web             # http://localhost:3000
cd apps/mobile && npx expo start                   # iOS / Android
```

**Demo account:** `demo@collegeos.app` / `CollegeOS-Demo-2026` — a realistic seeded semester.
Read from it; write against a throwaway (`npm run make:test-user`).

`bootstrap` is idempotent and never prints a key value. `npm run bootstrap -- --force` regenerates
the env files; `-- --no-start` skips starting Docker containers.

---

## Read next

**[`HANDOFF.md`](HANDOFF.md) is the full picture.** It is written for someone who has never seen
this repo or this machine.

| You need | Go to |
|---|---|
| Bringing this up on a new machine | `HANDOFF.md` §3 |
| Supabase schema, all 33 migrations, the cloud move | `HANDOFF.md` §4 → `docs/SUPABASE_SETUP.md` |
| Everything that exists, feature by feature | `HANDOFF.md` §5 |
| What shipped recently | `HANDOFF.md` §6 |
| Everything that remains, ordered | `HANDOFF.md` §8 |
| What was **never** verified, and why | `HANDOFF.md` §9 |
| **The problems this build kept repeating** | `HANDOFF.md` §10 |
| Durable decisions that must not be reversed | `.brain/memory/decisions.md` (D1–D22) |
| Rules an agent must follow in this repo | `CLAUDE.md` |

---

## The three laws of this codebase

1. **Postgres is the system of record.** Not the LLM, not a third-party app.
2. **Deterministic code calculates; Claude only interprets.** Every score, grade, average and
   streak is pure TypeScript in `packages/core`, unit-tested. The model is never asked to do
   arithmetic or to decide what matters.
3. **Every LLM response is schema-validated typed JSON.** Free-form prose never reaches the UI
   unvalidated, and extracted academic deadlines *always* require explicit user confirmation.

---

## Layout

```
apps/web        Next.js 16 App Router — desktop-first web app + landing page
apps/mobile     Expo SDK 57 + Expo Router — iOS/Android app
packages/core   Pure TS domain engine. No React, no I/O. All logic lives here.
packages/api    Typed Supabase data-access layer, shared by both apps.
packages/design Design tokens. Consumed by Tailwind (web) and StyleSheet (mobile).
supabase/       migrations · functions (Deno edge) · tests (pgTAP) · seed.sql · config.toml
scripts/        bootstrap + the four verify guards + test-user factories
docs/           plan · data model · design language · setup runbook · followups
.brain/memory/  durable decisions, environment facts, tooling gotchas, version pins
```

---

## State

```
272 commits · 33 migrations · 46 tables · 0 without RLS · 11 edge functions
web: 17 routes · mobile: 16 routes
```

| Suite | Result | When |
|---|---|---|
| `npm run verify` | **PASS (exit 0)** — 383 tests (core 351 · api 30 · mobile 2) | 2026-08-23 |
| pgTAP | **PASS — 463 assertions, 11 files** | 2026-08-23 |

**Not production-ready yet.** Four security items must be fixed before launch, the cloud project has
not been provisioned, and the Anthropic model path has never run against a live key. All of it is
scoped with runbooks — `HANDOFF.md` §8.
