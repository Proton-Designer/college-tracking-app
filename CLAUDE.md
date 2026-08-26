# CollegeOS

A personal **closed-loop operating system** for a college student. Not a habit tracker.

```
Observe → Plan → Execute → Detect deviation → Intervene → Reflect → Learn → Update next plan
```

## Start here

**Fresh clone? Run bootstrap first**, in the mode this machine uses:

- **Cloud project (no Docker):** `npm run bootstrap -- --cloud`, then `supabase link` →
  `supabase db push` → `npm run db:types:cloud` → `npm run verify`.
- **Local Docker stack:** `npm run bootstrap`, then `npm run db:reset && npm run db:types &&
  npm run verify`.

Either way it installs dependencies, reinstalls the untracked git hook, and writes the env files
(root, `apps/web`, `apps/mobile`, `supabase/`) — none of which are in git. Without them the app
fails at *runtime* with an auth error rather than at build time, so nothing points at the real
cause. **`npm run db:reset`, `db:test`, `test:e2e`, `test:integration` and `make:test-user` are
local-only** and will not work against a cloud project; `npm run verify` needs no database at all.
See `HANDOFF.md` §3.

**Read `HANDOFF.md` next** — what exists, what was verified and how, what was *not* verified, and
what remains before production.

| You need | Read |
|---|---|
| **Handover package (2026-08-26) — start here** | **`docs/HANDOVER.md`** |
| **Full deep handoff** | **`HANDOFF.md`** |
| **Setting this up on a new machine** | **`HANDOFF.md` §3** |
| Supabase schema, migrations, cloud move | `HANDOFF.md` §4 → `docs/SUPABASE_SETUP.md` |
| Everything that remains | `HANDOFF.md` §8 |
| Recurring problems this build kept hitting | `HANDOFF.md` §10 |
| Testing plan | `docs/L11_HARDENING.md` |
| Architecture, phases, scope | `docs/MASTER_PLAN.md` |
| Current project state | `docs/STATUS.md` |
| Original product brief (requirements) | `docs/context/SOURCE_BRIEF.txt` |
| Database schema | `docs/DATA_MODEL.md` |
| **Visual language + tokens** | **`docs/DESIGN_LANGUAGE_V2.md`**, `packages/design/` (`DESIGN_SYSTEM.md` is v1, superseded) |
| Cloud provisioning runbook | `docs/SUPABASE_SETUP.md` |
| Durable decisions | `.brain/memory/decisions.md` |

## The three laws of this codebase

1. **Postgres is the system of record.** Not the LLM, not a third-party app.
2. **Deterministic code calculates; Claude only interprets.** Risk scores, grades, streaks,
   averages, calibration, lateness — all pure TS in `packages/core`, all unit-tested. Claude is
   never asked to do arithmetic or to be a database.
3. **Every LLM response is schema-validated typed JSON.** Free-form model prose never reaches the
   UI unvalidated, and never silently writes to the database. Extracted academic deadlines
   *always* require explicit user confirmation before they are persisted as real.

## Layout

```
apps/web       Next.js 15 App Router — desktop-first web app + landing page
apps/mobile    Expo + Expo Router — iOS/Android app + welcome screen
packages/core  Pure TS domain engine. No React, no I/O. Where all logic lives.
packages/api   Typed Supabase data-access layer, shared by both apps.
packages/design Design tokens. Consumed by Tailwind (web) and StyleSheet (mobile).
supabase/      migrations · functions (Deno edge) · tests (pgTAP) · seed.sql
docs/          plan · data model · design system · setup runbook
```

**UI shells own layout and interaction only.** If a component computes a domain value, that
computation belongs in `packages/core` instead. This rule is what keeps web and mobile from
diverging.

## Rules that are easy to get wrong

- **Timezones.** This product is about *local days*. Never derive a day boundary from UTC. See
  the timezone section of `docs/DATA_MODEL.md`.
- **RLS on everything.** Every user-scoped table has row-level security. Adding a table without a
  policy is a security bug, not a TODO.
- **Secrets are server-side only.** Anthropic and OAuth credentials live in Edge Function
  secrets. Never in `apps/*`, never in a `NEXT_PUBLIC_*`/`EXPO_PUBLIC_*` var.
- **Journal content is sensitive.** It is never logged, never sent to an LLM beyond the minimum
  necessary subset, and never included in error reports.
- **Don't send history to the LLM.** Use the summary pyramid (daily → 7d → 30d → semester),
  not raw event history.

## Commands

```bash
npm run verify      # typecheck + lint + test across all workspaces
npm run db:start    # local Supabase (Docker)
npm run db:reset    # re-apply all migrations + seed
npm run db:types    # regenerate packages/api/src/database.types.ts
npm run db:test     # pgTAP suite (RLS + constraints)
```

After **any** migration change, run `npm run db:reset && npm run db:types`.

## Working agreements for agents

- Verify before claiming. Paste real command output; never assert a test passes without running it.
- Don't widen scope. If you find an unrelated problem, report it — don't fix it silently.
- Cross-engineer dependencies route through the lead. Never block waiting on a peer.
- End every assignment with a written report, even if the assignment failed.
