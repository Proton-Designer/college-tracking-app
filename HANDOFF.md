# CollegeOS — Handoff

> **Read this first.** It is written for two readers: a new agent picking the project up, and a
> **new machine** that has never built it. It records what exists, what was verified and *how*,
> what was **not** verified, what remains, and the mistakes this build kept making.
>
> Last full re-verification: **2026-08-23** (numbers in §7 were executed, not recalled).
>
> Reading order after this file: `CLAUDE.md` → `.brain/memory/decisions.md` (D1–D22) →
> `.brain/memory/environment.md` → `docs/FOLLOWUPS.md` → `docs/STATUS.md`.

---

## 1. What this is

A personal **closed-loop operating system** for a college student. Not a habit tracker.

```
Observe → Plan → Execute → Detect deviation → Intervene → Reflect → Learn → Update next plan
```

Three laws that govern every decision in the codebase:

1. **Postgres is the system of record.** Not the LLM, not a third-party app.
2. **Deterministic code calculates; Claude only interprets.** Every score, grade, average and streak
   is pure TypeScript in `packages/core`, unit-tested. The model is never asked to do arithmetic or
   to decide what matters.
3. **Every LLM response is schema-validated typed JSON.** Free-form prose never reaches the UI
   unvalidated, and extracted academic deadlines *always* require explicit user confirmation.

Product intent: `docs/context/SOURCE_BRIEF.txt`. Architecture: `docs/MASTER_PLAN.md`.

### Repository layout

```
apps/web        Next.js 16 App Router — desktop-first web app + landing page
apps/mobile     Expo SDK 57 + Expo Router — iOS/Android app
packages/core   Pure TS domain engine. No React, no I/O. All logic lives here.
packages/api    Typed Supabase data-access layer, shared by both apps.
packages/design Design tokens. Consumed by Tailwind (web) and StyleSheet (mobile).
supabase/       migrations · functions (Deno edge) · tests (pgTAP) · seed.sql · config.toml
scripts/        the four verify guards + test-user factories + sim helper
docs/           plan · data model · design language · setup runbook · followups
.brain/memory/  durable decisions, environment facts, tooling gotchas, version pins
e2e/            Playwright specs
```

---

## 2. START HERE — the state in one screen

| | |
|---|---|
| **Where the loop stands** | Every step of the loop has a working surface on both platforms. **Plan now reaches Execute** (P1, fixed 2026-08-23). |
| **Top open defect** | **P2** — a data-layer outage used to hang the page. The timeout fix is **written and unit-tested (13 tests)**; its **live pass has not been run**, and the mutation-mid-flight case has **never** been run. |
| **Top open feature gap** | The **web app still uses the floating Island for navigation.** It was ruled to get a **left sidebar** with a responsive collapse to the island under 768px. Designed, not built. |
| **Blocked on credentials** | Cloud Supabase deploy · Anthropic API key. Both have complete ordered runbooks. |
| **Blocked on hardware** | A real VoiceOver/TalkBack pass. A real Android device (blur does not exist there — G1). |
| **Tree state** | `main` clean, 272 commits, pushed to `origin` (`Proton-Designer/college-tracking-app`). |

### ✅ P1 is fixed — the loop closes

**Confirming a weekly-plan block now creates a real task that Today can see.** Migration `0033` adds
`weekly_plan_blocks.task_id`; confirming creates a task carrying `planned_date`,
`planned_start_at`, `estimated_minutes` and the deliverable/course link; re-confirming is
idempotent; **skipping cancels the task rather than orphaning it**, because "planned then abandoned"
is data the friction engine wants. Setting `planned_start_at` from the block is what makes **start
delay measurable for planned work** — the metric the brief names by example.

Verified twice: in Postgres (pgTAP + 15 integration tests, including skip-then-reconfirm never
minting a second task), then **walked end to end on a real iOS device** — plan generated, block
confirmed, task row confirmed in psql, Today showing it ranked in Top 3 with workload updating.
That native walk mattered: the first acceptance walk ran on Expo Web, where the form controls it
needed were silently broken (§9.4).

### 🔴 P2 is the highest-priority remaining item

With PostgREST stopped and auth still up, **6 of 6 routes never reached DOMContentLoaded in 8
seconds.** Kong's real ceiling for the `rest-v1` route is **60s** (the `read_timeout: 150000` in
`kong.yml` belongs to `functions-v1`, a different route — P2's original write-up misattributed it).
All 9 `(app)` routes have correct error branches, and they were unreachable inside human patience.
**A structurally-present error state that never renders is not an error state.**

The fix (`packages/api/src/client/timeoutFetch.ts`, commit `1e9a49b`) wraps `fetch` with a **10s
timeout scoped to `/rest/v1/` only** — deliberately *not* Edge Functions (`syllabus-extract` calls
Anthropic and can legitimately run tens of seconds) and *not* auth (a different, uncharacterised
failure mode). It throws an `AbortError` because postgrest-js explicitly skips retrying that name.
It distinguishes reads from writes, because **reads may report failure; writes may only report
uncertainty** — a write that timed out may still have landed.

**Still unrun, and it is the half that matters:** start a mutation, kill PostgREST mid-flight, and
find out both what the UI says *and* what actually landed in the database. A failed read is
visible; a write that appears to succeed is what costs real data.

---

## 3. Moving this project to a new machine

Everything below is what a fresh laptop needs. **Nothing in this section is guesswork — it is the
inventory of what is deliberately *not* in git, tested against a real fresh clone.**

### 3.0 Pick a mode first — this decides everything else

This project runs against either a **hosted Supabase project** or a **local Docker stack**. The
whole build was done locally; the product's future is cloud. They are not interchangeable, and
choosing is the first setup step, not a later one.

| | **Cloud** — a real Supabase project | **Local** — the Docker stack |
|---|---|---|
| Setup | `npm run bootstrap -- --cloud` | `npm run bootstrap` |
| Docker required | **No** | Yes |
| Supabase CLI required | Yes (`link`, `db push`, `gen types`, `secrets`, `functions deploy`) | Yes |
| Schema applied by | `supabase db push` | `npm run db:reset` |
| Types regenerated by | `npm run db:types:cloud` (`--linked`) | `npm run db:types` (`--local`) |
| Demo semester | **None.** Sign up for a real account. | `seed.sql`, `demo@collegeos.app` |
| `npm run verify` | **Works** — 383 tests, needs no database | Works |
| pgTAP · E2E · integration · `make:test-user` | **Do not run** — see §3.6 | Run |

The apps themselves need no code change to switch: `resolveAppEnvironment` in
`packages/api/src/env.ts` derives `mode: "local" | "cloud"` from the URL, and nothing below it
cares which. **Swapping environments is two env vars, by design** (MASTER_PLAN §3).

### 3.1 What git does NOT contain

| Missing | How to recreate |
|---|---|
| `node_modules/` | `npm install` at the repo root (npm **workspaces** — not pnpm, not yarn) |
| **Four** `.env.local` files — root, `apps/web/`, `apps/mobile/`, `supabase/` | `npm run bootstrap` writes them. **Next.js and Expo each load `.env.local` relative to their own app directory** — the root copy alone is not enough, which is why there are three of them. In **cloud** mode the `service_role` key is written to the **root file only**: neither app runtime uses it (its only consumers are `packages/api/src/integration/testSupport.ts` and `apps/web/e2e/fixtures/supabase-admin.ts`), so an RLS-bypassing key has no business sitting in an app directory. `supabase/.env.local` holds a `CRON_SHARED_SECRET`. |
| `.git/hooks/commit-msg` | `.git/hooks` is untracked, so the trailer-stripping hook does not survive a clone. `npm run bootstrap` reinstalls it. |
| `.env` (cloud) | Does not exist yet. Copy `.env.example` and fill from the cloud project — see §4.4. |
| Local Postgres data | `npm run db:reset` re-applies all 33 migrations + `seed.sql`. The seed **is** the demo semester. |
| `.expo/`, `.next/`, build output | Regenerated. |
| Verification screenshots | Deliberately untracked (`.brain/*.png`) — 93 of them once pushed `.git` to 40MB. `.brain/memory/*.md` **is** tracked and is the durable part. |

> **Why this list matters more than it looks.** A missing `NEXT_PUBLIC_SUPABASE_URL` does not fail
> the build — it fails at *runtime* as an auth error, with nothing pointing at the real cause. That
> is the same "structurally correct, practically unreachable" shape as P2 and as §10.1.
> `npm run bootstrap` exists so nobody has to rediscover it.

### 3.2 Toolchain the build machine had (verify, don't assume)

Recorded in `.brain/memory/environment.md`; re-verify on the new machine.

```
Node v24.9.0  ·  npm 11.6.0        (engines requires >= 20.11.0)
Docker 29.7.2                       (local mode only -- NOT needed for a cloud project)
Supabase CLI 2.98.2                 (2.115.0 works, but see the note below -- it breaks
                                     `functions deploy` unless config.toml names the import map)
psql 17 at /opt/homebrew/opt/postgresql@17/bin/psql   (add to PATH)
Playwright 1.62.1 via npx
Xcode + iOS Simulator (iPhone 16 Pro). The iPhone 17 Pro record is CORRUPT — see N2.
idb (fb-idb) for driving the simulator
```

**Version pins that must not be casually bumped** — full reasoning in `.brain/memory/versions.md`,
seven landmines documented there. The three most dangerous:

- **TypeScript stays on 5.9.3.** TS 7.0 is npm `latest` and is a Go rewrite with no stable
  language-service API; `typescript-eslint` peer-requires `<6.1.0`. Installing "latest" silently
  breaks lint across both apps while `tsc` still appears to run.
- **Never hand-pick `react-native` / `reanimated` / `gesture-handler` versions.** Always
  `npx expo install`. Expo SDK 57 is built against RN 0.86.2; npm's "latest" is 0.87 and produces
  native crashes rather than a clean dependency error.
- **Jest stays on 29.7.0.** `jest-expo@57` depends directly on the Jest 29 line.

**Supabase CLI 2.115.0 — adopted, with one required config change.** Verified 2026-08-23 against a
real cloud project. The trap is `functions deploy`:

- 2.98.2 auto-discovered `supabase/functions/deno.json` as the import map. **2.115.0 does not.**
  Ten of the eleven edge functions import zod by bare specifier (`import { z } from "zod"`), so a
  bare `supabase functions deploy` fails at bundle time with `Relative import path "zod" not
  prefixed with / or ./ or ../`. Only `account-export` — the one function with no zod import —
  survives. **`nightly-analysis` is among the ten**, so the nightly loop silently does not exist
  while the deploy *looks* like it partially succeeded. This is §10.1's shape again: structurally
  correct, practically unreachable.
- Fixed by `import_map = "./functions/deno.json"` on every `[functions.*]` block in
  `supabase/config.toml`. Both CLI versions honour the setting, so this is safe either way.
  Passing `--import-map supabase/functions/deno.json` on the command line works too, but only
  rescues the person who remembers to type it.

Two further 2.115.0 differences, both harmless once you know them:

- `supabase gen types` emits an `__InternalSupabase: { PostgrestVersion }` block and drops the
  file's trailing newline. So §3.3's "expect NO change" from `npm run db:types:cloud` is wrong on
  this CLI: you get a 4-line diff that is **not** schema drift. Read the diff before believing it.
- `supabase db diff --linked` **still requires Docker** — it builds a shadow database to diff
  against. It cannot run in the §3.3 no-Docker path at all; that step is listed there in error.
  `db:types:cloud` is the closest Docker-free substitute (it sees tables, columns, enums and
  function signatures, but not RLS policy or trigger drift).

### 3.3 First hour — cloud (no Docker)

Have the project's **URL** and **anon/publishable key** ready (dashboard → Project Settings → API
Keys). The `service_role` key is optional and only needed to run the integration/E2E suites.

```bash
git clone https://github.com/Proton-Designer/college-tracking-app College-app
cd College-app
npm run bootstrap -- --cloud      # prompts for the credentials, or reads them from the
                                  # environment or a .env file. No Docker involved.

supabase login
supabase link --project-ref <PROJECT_REF>

supabase db push --dry-run        # review before touching the database
supabase db push                  # apply all 33 migrations
supabase db diff --linked         # expect: no differences

npm run db:types:cloud            # regenerate against the real project...
git diff --stat packages/api/src/database.types.ts   # ...and expect NO change. A diff here
                                  # means cloud and local schemas disagree — stop and read it.

npm run verify                    # 383 tests. Needs no database at all.
```

Then Edge Function secrets and deploy:

```bash
supabase secrets set CRON_SHARED_SECRET=$(openssl rand -hex 16)
supabase secrets set ANTHROPIC_API_KEY=...   # optional — without it the nightly report uses
                                             # the deterministic fallback and says so on screen
supabase functions deploy
```

**Before anyone else touches the project, fix the four security items in §8.2.** They are not
theoretical: `collegeos://` is hijackable, and on a confirmation or reset link that means an
attacker intercepting a session.

`bootstrap --cloud` **refuses** rather than writes when the URL points at localhost, when the URL
is not https, or when the value in the anon slot is actually a `service_role`/secret key. That last
check exists because pasting the secret key into `NEXT_PUBLIC_SUPABASE_ANON_KEY` ships an
RLS-bypassing credential to every browser — and it would work perfectly in testing, which is what
makes it dangerous.

### 3.4 First hour — local Docker stack

```bash
open -a Docker      # the daemon must be up before you start

git clone https://github.com/Proton-Designer/college-tracking-app College-app
cd College-app
npm run bootstrap   # checks prerequisites, npm install, installs the git hook,
                    # starts the local Supabase stack, writes all four .env.local files

npm run db:reset    # 33 migrations + seed.sql + Kong refresh
npm run db:types    # regenerate packages/api/src/database.types.ts
npm run verify      # 4 guards → typecheck ×5 → lint → 383 tests. MUST exit 0.
npm run db:test     # pgTAP: 11 files, 463 assertions
```

`bootstrap` is **idempotent** in both modes — it never overwrites an existing file and never prints
a key value. `--force` regenerates the env files; `--no-start` (local only) skips starting Docker.

**The local sequence was executed against a real fresh clone on 2026-08-23**, not written from
memory: clone → `bootstrap` → `verify` returned **exit 0 with 383 tests passing**. Doing it is what
surfaced that there are *four* env files rather than two — this document previously said two, and a
new machine following it would have hit a runtime auth error with nothing explaining why.

### 3.5 What is local-only, and what that costs a cloud-first setup

These commands need the Docker stack and the seeded demo account. **None of them work against a
cloud project**, and it matters what each one was buying:

| Command | What it proves | Cloud substitute |
|---|---|---|
| `npm run db:test` (pgTAP, **463 assertions**) | RLS isolation and constraints, *in the database* | Nothing equivalent. This is the biggest loss — RLS is the only thing making the anon key safe to ship. Keep a local stack somewhere, or run these against a throwaway cloud project before touching the real one. |
| `npm run test:integration` (101 tests) | `packages/api` against a real Postgres | Needs a `service_role` key and would write real rows. Point it at a staging project, never production. |
| `npm run test:e2e` (28 specs) | Real browser against a real stack | Same caveat, plus it creates and deletes users. |
| `npm run make:test-user` / `make:calm-user` / `clean:test-users` | Throwaway accounts to write against | **Refuse to run against a non-localhost URL** — a deliberate guard in each script, not an oversight. Sign up through the UI instead. |
| `npm run db:reset` | Re-apply migrations + seed | `supabase db push`. **`db:reset` drops data** — it is local-only by design, but never reach for it out of habit. |
| `seed.sql` / `demo@collegeos.app` | A realistic curated semester for screenshots and manual verification | There is no demo account in the cloud. Create a real one; that is also the honest test, since §10.1 records what verifying only against a seeded account cost this project. |

**`npm run verify` needs no database.** Its 383 tests are pure, and the one guard that touches
Postgres (`check:demo-clean`) skips with a warning and exit 0 when no local stack is reachable —
verified by running it with the stack unreachable, not assumed.

Then, in separate terminals:

```bash
supabase functions serve --env-file ./.env.local   # edge runtime — NOT part of db:start (see §10)
npm run dev --workspace=@collegeos/web             # http://localhost:3000
cd apps/mobile && npx expo start                   # simulator/device
cd apps/mobile && npx expo start --web --port 8082 # browser-verifiable mobile — read §9.4 first
```

**Demo account:** `demo@collegeos.app` / `CollegeOS-Demo-2026` — a realistic seeded semester.
**Read from it; write against a throwaway** (`npm run make:test-user`, cleanup
`npm run clean:test-users`). `npm run make:calm-user` equivalent lives at
`scripts/make-calm-user.mjs` — a fixture for a genuinely low-risk account, which the seed cannot
produce.

### 3.6 Local service map (local mode only)

| Service | URL |
|---|---|
| API (Kong) | http://127.0.0.1:54321 |
| Postgres | postgresql://postgres:postgres@127.0.0.1:54322/postgres |
| Studio | http://127.0.0.1:54323 |
| **Mailpit (test inbox)** | http://127.0.0.1:54324 |
| Edge Functions | http://127.0.0.1:54321/functions/v1 |
| Web dev server | http://localhost:3000 (**must match Supabase `site_url`**) |
| Metro | http://localhost:8081 |

Direct psql without a local client:
```bash
docker exec supabase_db_college-app psql -U postgres -d postgres -c "<sql>"
```

### 3.7 Git / GitHub

- Remote: `https://github.com/Proton-Designer/college-tracking-app`, branch `main`.
- A `.git/hooks/commit-msg` hook strips `Co-Authored-By: Claude` and `Claude-Session:` trailers.
  **Hooks are not cloned** — recreate it on a new machine if that behaviour is wanted.
- Commit authorship is the repo owner's, not an agent's.

---

## 4. Supabase — schema, migrations, and the cloud move

### 4.1 The shape of it

**Postgres is the system of record** (law 1). Supabase Edge Functions are the only backend — there
is no separate server (D2). The apps talk to Postgres through PostgREST via `packages/api`, and to
Deno edge functions for anything that needs a secret or a long-running call.

```
33 migrations · 46 tables · 0 tables without RLS · 11 edge functions
```

### 4.2 Migrations — the full ordered set

They are numbered, immutable once applied, and applied in filename order. `supabase/migrations/`:

| # | File | What it establishes |
|---|---|---|
| 01 | `extensions` | `pgcrypto`, `uuid-ossp`, `pg_cron`, `pg_net`, `supabase_vault`, `pgtap` |
| 02 | `enums_and_helpers` | domain enums + the **local-date helpers** that keep day boundaries off UTC |
| 03 | `identity` | profiles, the `handle_new_user` bootstrap trigger |
| 04 | `academic` | courses, deliverables, weight categories, grade boundaries |
| 05 | `tasks` | tasks, task↔deliverable links |
| 06 | `daily_loop` | daily check-ins, predictions, reviews, summaries |
| 07 | `behavior` | friction logs, kill habits, kill events |
| 08 | `telemetry` | WHOOP / RescueTime ingestion tables |
| 09 | `intelligence` | insights, experiments, semester lessons, agent reports, `llm_usage_log` |
| 10 | `integrations` | OAuth connections, Vault-encrypted token storage |
| 11 | `storage` | syllabus upload bucket + policies |
| 12 | `focus_sessions` | focus/session timing |
| 13 | `task_timeboxing` | planned start / estimated minutes on tasks |
| 14 | `scheduled_jobs` | `pg_cron` registration, **gated on a Vault secret existing** (D17) |
| 15 | `semester_lessons_source_insight` | lesson provenance |
| 16 | `interventions` | the Intervene step's tables |
| 17 | `brightspace_ics` | ICS feed + pending calendar events |
| 18 | `private_function_wrappers` | **`public` wrappers over `private.*`** (D19) |
| 19–23 | telemetry/vault/deletion fixes | external account ids, vault restore fix, user-scoped table listing |
| 24 | `task_session_target_achieved` | proof-of-work gate |
| 25 | `weekly_planning` | the Sunday session: plans, blocks, free-interval math |
| 26–27 | experiment direction, stale-task prompt | |
| 28–29 | disconnect flows | OAuth + Brightspace teardown |
| 30 | `course_archive` | |
| 31 | `nullable_prediction` | the fix for a new user's fabricated 80% (§6) |
| 32 | `experiment_metric` | named metrics, so a decoy reading can't poison a verdict |
| 33 | `weekly_plan_block_task_link` | **P1's fix — the block→task link that closes the loop** |

**After any migration change:** `npm run db:reset && npm run db:types`. Non-negotiable — the
generated `database.types.ts` is what makes `packages/api` typed, and a stale one typechecks fine
while being wrong.

### 4.3 Rules the schema enforces

- **RLS on everything.** All 46 user-scoped tables have `relrowsecurity` **and**
  `relforcerowsecurity`. Adding a table without a policy is a security bug, not a TODO. Enforced by
  pgTAP `10_rls_universal_coverage.test.sql`, which was itself once broken such that it could not
  fail — that is fixed.
- **`private.*` functions need an explicit `public` wrapper** (D19). Don't "simplify" by exposing
  the schema.
- **Never derive a day boundary from UTC.** This is the single most repeated bug in the project's
  history (§10). SQL helpers exist for it; use them.
- **Vault** stores third-party OAuth tokens encrypted. It works locally.
- **`pg_cron` + `pg_net` work fully on the local stack** (D17) — the earlier belief that they
  needed `shared_preload_libraries` was wrong. Cron reaches the edge runtime via
  `http://kong:8000/...`, **not** `127.0.0.1`.

### 4.4 The cloud move

`docs/SUPABASE_SETUP.md` is the complete ordered runbook — 12 sections, every step either a
pasteable CLI command or a named dashboard control with the exact value. **§3.3 above is the
compressed version and the one to follow for a fresh machine.**

The one check worth calling out separately, because it is easy to skip and expensive to skip:

```bash
npm run db:types:cloud
git diff --stat packages/api/src/database.types.ts   # expect NO change
```

A diff there means the cloud schema and the local one disagree — a migration that didn't apply, an
extension the dashboard has to enable first, or a manual dashboard edit someone made. **Stop and
read it.** The generated types are what make `packages/api` typed, and a wrong one typechecks
perfectly while describing a database that doesn't exist.

Then: set Edge Function secrets (`supabase secrets set CRON_SHARED_SECRET=… ANTHROPIC_API_KEY=…`);
`supabase functions deploy`; create the storage bucket; enable cron.

**Choose the region closest to the primary user. It cannot be changed later without recreating the
project**, and it is the single largest lever on perceived latency — which matters more here than
it looks, because of §9.5.

**Four security items must be fixed before this is public** (§8.2). They are in `SUPABASE_SETUP.md`
§5 and re-verified accurate.

**The `service_role` key bypasses RLS.** Edge Functions and CI only. Never in `apps/*`, never in a
`NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` variable. This has been checked against the real web bundle
*and* a real compiled iOS Hermes bundle — neither contains it.

---

## 5. Feature inventory — everything that exists

This is the complete list. Everything here is built, wired into a real request path, and has a
surface on both platforms unless a divergence is named.

### 5.1 The loop

| Step | Surface | Engine |
|---|---|---|
| **Observe** | `/today` Day Trace, Day Ribbon, workload level | `workload/`, `risk/` |
| **Plan** | Morning check-in (Top 3, prediction), weekly planning in `/calendar` | `checkin/`, `planning/` |
| **Execute** | Focus sessions (`/focus/[sessionId]`), task completion, proof-of-work | `backplan/` |
| **Detect deviation** | Start-delay + planning-execution gap, friction logging | `friction/`, `planning/planningExecutionGap` |
| **Intervene** | Deviation prompts, escalation ladder, exception notifications, stale-task prompts | `interventions/` (4 evaluators) |
| **Reflect** | Night review incl. **voice input**, decision journal | `reports/` |
| **Learn** | Insights, experiments with measurement + scoring, calibration, semester lessons | `insights/`, `calibration/` |
| **Update next plan** | Recovery mode + MVD, bounce-back, next-day planning | `recovery/`, `bounceback/` |

### 5.2 Data entry & onboarding (E0–E5)

Course CRUD · assignment/deliverable CRUD · task CRUD and quick-add · weight categories · grade
boundaries · deliverable detail with backplan generation and proof-of-work config · syllabus upload
→ LLM extract → **explicit user confirmation** → persist · Brightspace ICS feed → pending events →
confirmation · an onboarding gate that checks for a **real course** rather than a `has_onboarded`
flag.

**Acceptance test passing on both platforms:** brand-new account → populated Today, no psql, no
seed.

### 5.3 Grades & risk

Weighted-additive risk engine (D6 — deliberately *not* the brief's pure product) · missing factors
excluded and renormalized, never defaulted (D7) · course grade, required-score, letter grade,
what-if scenarios · `deriveDayBand` (a **maximum**, not an average — a day holding one critical
deliverable is a critical day).

### 5.4 Integrations

| Integration | State |
|---|---|
| **Brightspace ICS** | Built L10, **verified end to end** — a real pending event confirmed through the UI produced a real `calendar_events` row |
| **WHOOP** | OAuth2 + webhook + telemetry sync + daily rollup. Full loop wired (`_shared/whoop/webhookHandler.ts`). Offline-proven. |
| **RescueTime** | API-key auth, daily summary sync, rollup. Offline-proven. |
| **Anthropic** | Fully built, schema-validated, budget-capped, tested against golden fixtures. **Has never met a live model.** |

All outbound fetches go through an **SSRF guard** (`core/integrations/ssrfGuard`, 13 tests).

### 5.5 Edge functions (11)

`nightly-analysis` · `weekly-synthesis` · `syllabus-extract` · `syllabus-confirm` ·
`brightspace-sync` · `brightspace-confirm` · `whoop-oauth-callback` · `whoop-webhook` ·
`rescuetime-sync` · `account-export` · `account-delete`.

`packages/core` is **mirrored** into `supabase/functions/_shared/` because Deno cannot import it
directly (D16), and **the staleness guard on that mirror is load-bearing** — a stale mirror means
edge functions compute risk with *different logic* than the apps display.

### 5.6 Account & privacy

Full data export (measured: 224,596 bytes across 45 tables on the demo account) · account deletion
that also clears Vault secrets · OAuth disconnect · Brightspace disconnect.

**Journal content is sensitive**: never logged, never sent to an LLM beyond the minimum necessary
subset, never in an error report. See S13 in §8.4 — that claim is currently true *because the day
journal does not exist yet*, not because redaction is tested.

### 5.7 The design system — v2 "Aurora"

`docs/DESIGN_LANGUAGE_V2.md` is **the visual authority**. `docs/DESIGN_SYSTEM.md` ("Instrument", v1)
is **superseded** — its structural rules survive, its surface does not.

Cool `#F4F6FB` ground · indigo `#3A56F0` (deliberately not Apple's blue, which would make it a copy
of the reference) · **Instrument Sans + Geist Mono**, IBM Plex Serif removed entirely · radii
10/14/20/28 · three glass tiers with a mandatory opaque fallback · a **floating dark glass island**
for mobile navigation · 23 shared UI primitives (`Panel`, `Modal`, `Select`, `Input`, `Textarea`,
`DatePicker`/`TimePicker` with `null` as a first-class value, `Toast`, `EmptyState`, `Skeleton`,
`Badge`, `RiskPill`, `WarningCard`, `SegmentedControl`, …) with a `/design` showcase route on both
platforms that doubles as the regression surface.

**The one design idea that is ours rather than the reference's:** the ambient field is an
*instrument reading*. Its hue mix derives from a real computed `RiskBand` via `deriveDayBand()` in
`packages/core`. **An account with no computed risk gets no atmosphere**, and six screens
legitimately get none at all. Under that sits a fixed neutral **resting wash** (§6.0 of the design
doc) that reports nothing and never varies, because glass is only legible as glass when there is
something behind it to refract. The two layers never stack.

### 5.8 Routes

**Web (17):** `/` landing · `/login` · `/signup` · `/forgot-password` · `/reset-password` ·
`/auth/confirm` · `/design` · `(app)/today` · `/courses` · `/courses/[id]` · `/deliverables/[id]` ·
`/calendar` · `/insights` · `/review` · `/review/[date]` · `/settings` · `/focus/[sessionId]`

**Mobile (16 routes + 2 layouts):** the same set, with tabs for today/courses/insights/review, plus
`auth/callback`. Two accepted divergences: **no syllabus upload on mobile** (N5 — deliberate; the
flow dead-ends without an Anthropic key, revisit the day one exists) and **no calibrated-grid
texture** (N1).

---

## 6. Recently completed

### 6.1 This session (2026-08-22 → 08-23, ~80 commits)

**The v2 "Aurora" revamp (61 commits).** The v1 surface was rejected by the user as *"primal and
barebones."* That was a fair reading: cream ground, serif display, hairline boxes, 3/5/8 radii, a
text-only tab bar. Internally consistent, and cold. All 17 web routes and all 18 mobile routes
converted, verified live on both platforms.

**P1 fixed** — migration `0033`, the block→task link. Plan reaches Execute for the first time in the
project's history. Walked end to end on a real iOS device.

**P2 implemented** — `timeoutFetch.ts`, 13 tests, wired into all three clients
(`browserClient` / `serverClient` / `nativeClient`), with new `timeout_read` / `timeout_write`
error codes and ratified copy. **Live pass still outstanding.**

**Real defects found and fixed during the revamp — none of them styling bugs:**

- 🔴 **`overflow: hidden` on the glass root made every mobile `TextInput` unfocusable** (G5). Tapping
  a field flashed and deselected; nothing could be typed. **Four verification passes missed it**
  because all four were inspections, not interactions. Fixed by moving the clip onto a
  `pointerEvents="none"` decoration layer inside `GlassSurface`, leaving the interactive subtree
  unclipped. The file carries a comment saying do not simplify this back onto the root.
- 🔴 **`Select` / `DatePicker` / `TimePicker` triggers were untappable on device** (G6). Same file,
  **different mechanism** — pure flex sizing collapsing them to zero height, not overflow. Worth
  keeping the distinction: sharing a file is not sharing a cause.
- 🔴 **The modal sheet clipped its own footer** (G7), hiding Cancel/Save on long forms. A percentage
  `maxHeight` resolved against an *indefinite* parent, plus React Native's `flexShrink: 0` default.
- 🔴 **The gray box the user reported.** `TabScreenScrollView` applied a `marginBottom` while the tab
  bar was already in normal flow — reserving its height twice. Fixed structurally by the island;
  `useTabBarClearance` and `design/layout.ts` deleted.
- 🔴 **`z-index` tokens compiled to nothing** — Tailwind v4 only emits `z-*` utilities from a
  `--z-index-*` namespace. Latent through all of v1 because a flat UI never created a competing
  stacking context; `backdrop-filter` made it real, and a glass panel began swallowing clicks on a
  modal footer. **The revamp did not introduce it; it removed the condition hiding it.**
- 🔴 **`Modal` had no focus trap at all** — three Tab presses escaped the dialog onto a live link
  behind the scrim.
- 🟡 **35 instances of real 13px body copy using `inkFaint`**, whose own token comment says *never
  body text* — 3.00:1 against a required 4.5:1. Plus two risk colours failing WCAG *where they
  actually render* (`riskModerate` 3.31, `riskHigh` 3.41).
- 🟡 **`accessibilityState` is a no-op on react-native-web** (G4) — correct role, correct name, no
  state announced. This blinds the audit *method*, not just one screen.
- 🟡 Two independent **stale-state contradictions** on `/today`, where a headline and the list
  beneath it read different sources. Fixed by extracting `derivePlannedMits` into `packages/core`
  so web and mobile cannot diverge.
- 🟡 **A real zero rendered identically to an absent value** — twice, once *inside the fix for it*.

**Two verification techniques earned their keep and should be reused:**

1. **Manufacture the state your data cannot produce.** A synthetic archived report to prove a page
   reads the *recorded* band and not today's; a zero-duration session; a low-band fixture (now
   `scripts/make-calm-user.mjs`).
2. **Measure a `:focus-visible` style only while the element is actually focus-visible.** Otherwise
   `getComputedStyle` returns a plausible, *wrong* answer instead of an error. An artifact of
   getting this wrong was reported as the pass's most severe finding before being disproved with
   Chrome DevTools Protocol matched-rules output.

### 6.2 The session before it

**Data entry & onboarding (E0–E5)** · **loop completion** (U1 interventions — four evaluators that
had **never run** · U3 proof-of-work · U5 office hours · U6 weekly planning · U7 decision journal ·
U9 experiment measurement and scoring) · **correctness fixes** (B1/B2 course detail returned 500 on
*every* real course on both platforms · **B4** day boundaries derived from UTC across **15 measured
sites** · B6 an all-day calendar event contributed 24h of committed time · T1/T2 Recovery Mode named
nothing and removed all agency · R1 · R2 · **V1** night-review voice input, specified in the brief
and never built) · **hardening** (first real production performance measurement · full security
review · sparse-account pass · structural accessibility audit · the RLS guard fixed so it can
actually fail).

---

## 7. Measured state — executed 2026-08-23

```
272 commits · 33 migrations · 46 tables · 0 without RLS · 11 edge functions
web: 17 routes · mobile: 16 routes (+2 layouts) · 8 E2E specs
23 `packages/api` integration-test files · 15 Deno edge integration tests
```

**Re-run today, exit 0:**

| Suite | Result |
|---|---|
| `npm run verify` | **PASS (exit 0)** — 4 guards, typecheck ×5 workspaces, lint, **383 tests**: core 351 (39 files) · api 30 (3 files) · mobile 2 (1 suite) |
| pgTAP (`npm run db:test`) | **PASS — 463 assertions across 11 files** |

**Last measured 2026-08-22, not re-run today** (labelled honestly — a doc row is a claim about the
past):

| Suite | Result |
|---|---|
| `packages/api` integration (real DB) | 101 / 101, twice consecutively (D14) |
| Deno edge, offline | 86 / 86 |
| Deno edge, live DB | 60 / 60, twice |
| Playwright E2E, desktop + mobile | 28 / 28, twice, at `--workers=2` — **but see G2**, the suite's signal is degraded |
| Production bundle | 1,264 KB raw / **348 KB gzipped** across 18 routes |

Playwright runs at two workers deliberately: single-worker hid a real locator ambiguity. *The
setting that makes a suite pass is not always the setting that makes it useful.*

**The four guards in `npm run verify` have each caught a real defect** that typecheck, lint and
review all missed. Do not disable one to make a build pass.

- `check:imports` — cross-package import legality
- `check:core-mirror` — the Deno mirror is not stale (D16)
- `check:barrel-exports` — no unreachable public export (D20's automation)
- `check:demo-clean` — no test contamination in the demo account

---

## 8. What remains before production

### 8.1 Product work still to build

| Priority | Item |
|---|---|
| 🔴 **1** | **P2's live pass** — mutation-mid-flight **first**, while the test budget is guaranteed. It is the one that can cost real data; the timeout firing across 12 routes is confirmatory, the write test is discovery. Then `/review`, `/review/[date]`, `/settings`, which the failure pass never reached. |
| 🔴 **2** | **The web responsive shell.** Sidebar ≥1024px / collapsed rail 768–1023 / island <768. Screenshots at 1440, 1024, 768 and 390 **before** proceeding past the shell. Then `/today` two-column at ≥1280, then a sweep of every route at all four widths **driving** the nav rather than measuring it. |
| 🟡 3 | P1's web half — the `/calendar` confirm → `/today` walk, on web |
| 🟡 4 | Swap web's `/today` headline source onto `derivePlannedMits` (mobile already uses it) |
| 🟡 5 | **G4's ten remaining files** — `accessibilityState` gaps |
| 🟡 6 | **S5 — no stale-task surface.** `overdueTaskCount` is windowed to 7 days (correct: an unbounded count made Recovery Mode *permanent*). Second-order consequence: tasks older than 7 days count for **nothing** and nothing surfaces them, so the product silently accumulates dead tasks — violating "nothing the system defers is silent." |
| 🟡 7 | **S1/S2/S8/G2** — shared-mutable test state. The integration suites sign in as the shared demo account; test users accumulate (14 `auth.users` against a seed of 1); one assertion query was unscoped and silently matched rows from *every prior run*. |
| 🟢 8 | **S10** — Android data export shares JSON as share-sheet *text*, not a saved file. Needs `expo-sharing` + a `FileProvider` `content://` URI. |

### 8.2 Must fix — security (all four re-verified accurate)

- 🔴 **`collegeos://` is hijackable.** Another app registering the same scheme can intercept an auth
  callback — on a confirmation or reset link that means intercepting a session. Fix: **Universal
  Links (iOS) / App Links (Android)**, domain-verified. Needs a real domain + an AASA file.
- 🔴 **Remove `exp://127.0.0.1:8081/**` from the redirect allow-list.** Development only.
- 🔴 **Configure custom SMTP.** Supabase's built-in mailer is rate-limited and will silently throttle
  confirmation emails.
- 🔴 **The redirect allow-list must use exact hosts, no wildcard origins.** A permissive list turns
  every password-reset email into a credential-phishing vector.

### 8.3 Must verify (blocked on credentials or hardware)

- **Cloud deploy** — §4.4 / `docs/SUPABASE_SETUP.md`.
- **Anthropic activation** — §9.1. The 5-step checklist is in `SUPABASE_SETUP.md` §7. **If a live
  response shape differs from a fixture, update the fixture from reality — never patch the test.**
- **A real VoiceOver / TalkBack pass on a physical device** — §9.2.
- **A real Android device** — G1: `expo-blur` never blurs on Android, so the glass effect does not
  exist there at all.
- **A real device run generally** — §9.4 names **three independent reasons**, each found separately.

### 8.4 Open items worth knowing

Full list with reasoning: `docs/FOLLOWUPS.md`. Notably **S13** — "journal content is never logged"
is currently true *because the feature does not exist yet*, not because redaction is tested.
**Re-test the day journal entries ship.**

### 8.5 Deliberately deferred — decisions, not oversights

- **Offline.** "Last-known data with an explicit staleness timestamp" is a caching *feature*, not a
  hardening task. Building it late and unproven would be worse than shipping without it and saying
  so.
- **U5's contextual surfacing and U8.** Both need a real rule or real data, not effort.
  *"Repeatedly" is not a threshold anyone gets to invent.*
- **`computeRiskAssessment`'s shared read.** Nine callers; churn at eight sites for a gain at one.
  Shape filed, not scheduled.
- **N3** — `globalMeanStartDelayDays = 1.5` is a prior, not a measurement. Correct for a
  single-user product with no population to average; named, commented, and confidence downgrades
  when it is used.

---

## 9. What has NOT been verified — read before trusting anything

### 9.1 The model path has never run
No `ANTHROPIC_API_KEY`. The nightly report comes from the deterministic fallback
(`usedModel: false`) and says so on screen. The failure is now provably *the model call* rather than
an unreachable function — narrower than before, still a gap.

### 9.2 Accessibility — structural only
A live keyboard pass on web found a real invisible-focus bug in `Modal`. Mobile had a **structural
audit** (static props + the Expo-Web ARIA tree) which found three accessible-name leaks, including a
Checkbox announcing as *"check, No Instagram before 6 PM"*.

**That is not a VoiceOver pass.** A screen reader tests announcement order, whether a live region
interrupts, and whether a name makes sense *spoken*.

**And see G4: the audit method itself is blind to state.** `accessibilityState` is a no-op on
react-native-web, which is exactly what the Expo-Web ARIA-tree audit reads — so every `checked`,
`selected`, `disabled` and `busy` in the app is **unverifiable by that method**, not
verified-and-passing. Ten files still carry the gap.

Web's reduced-motion and reduced-transparency guards were driven via CDP emulation and genuinely
collapse the glass; mobile's could only be confirmed structurally.

### 9.3 Failure and offline states
All 9 `(app)` routes have explicit error branches — **and the failure pass proved that is not
enough** (P2, §2). The fix is written and unit-tested; **the live pass is unrun**, and the
mutation-mid-flight case has never been run on any platform.

### 9.4 The Expo-Web harness is blind to four whole classes of interaction

Read this before trusting any mobile verification claim. Nearly all mobile checking has run through
Expo Web, and it **structurally cannot reach**:

1. **Date/time pickers** (G3). `DatePicker.open()` branches android → native picker, else →
   `setIosOpen(true)`, and that modal is gated on `Platform.OS === "ios"` — so on web neither fires.
   *Not a user-facing defect:* a branch fires on both shipping platforms.
2. **Auth confirmation.** The local redirect allow-list permits `exp://127.0.0.1:8081/**` and
   `collegeos://**` only, so a confirmation link cannot complete through a browser-preview port.
   That is the config correctly refusing an unlisted target.
3. **Accessibility state** (G4) — §9.2.
4. **Touch delivery under `overflow: hidden`** (G5) — the fatal one. Web's `overflow: hidden`
   clips paint but still delivers pointer events; iOS's `clipsToBounds` does not. **The bug that
   made the entire app unusable was invisible in the harness used to verify it.**

**The lesson, stated plainly: an inspection tool is not an interaction test.** Four passes read the
DOM, the styles and the props of a text input and reported it correct. Nobody tapped it.

**The first full mobile journey in this project's history** was walked on 2026-08-22 — 12 steps,
signup through nightly report, zero console errors. Two steps used admin-API workarounds and are
flagged as such: the account was confirmed via `updateUserById` rather than the link, and one
deliverable was created directly because of (1). **The confirmation-link / deep-link mechanism
itself remains unexercised on any platform.**

A full **web** journey the same day found **zero product defects** — four apparent bugs all traced
to the test harness, one of them the `new Date().toISOString()` day-boundary bug *this project
already fixed across 15 sites in the product*, reappearing in a fixture. **The rule binds test code
too.**

### 9.5 `/today` issues round trips, though fewer
A shared `calendar_events` read took `/today` from 5 reads of that table to 2, proven by a
byte-identical `getDayView` payload diff. The wider pattern remains: several domain functions each
re-read `deliverables` and `courses`. Invisible locally (131 ms), **not invisible against cloud
Supabase** at 30–50 ms RTT. `docs/L11_HARDENING.md` §1.

---

## 10. Past issues and recurring problems

**This is the most valuable section in the file for a new reader.** These are not one-off bugs —
they are patterns that recurred, each of them more than once.

### 10.1 The dominant pattern: *"stores its own state correctly, and is a dead end"*

Five separate features shipped in exactly this shape:

- **Recovery Mode** showed the day and removed every action.
- **Experiments** could be started and never scored.
- **Decisions** could be logged and never scored.
- **Interventions** had four fully-tested evaluators with **no caller anywhere** — the demo account
  held zero intervention rows.
- **Weekly-plan blocks** could be confirmed and never executed (P1).

**Every one of them passed its own tests.** What none of them had was somebody walking the product
end to end asking *"and then what happens?"* This became **D20**: a component isn't done until
something in the **real request path** calls it — and `check:barrel-exports` is the automated
version of that question.

At product scale, the same pattern hid an entire missing *verb*: **the product had no data-entry
path.** No way to create a course, a task or an assignment. A real user signed up to a permanently
empty app on both platforms. Worse, first-run was actively nonsensical — a new user was asked to
predict what percentage of an **empty day** they would finish, pre-set to 80%, and that fabricated
80% was written to `daily_predictions` and later scored against a real 0%. **A new user's
first-ever calibration data point was an 80-point miss they never made.**

**Why it stayed invisible:** every verification ran against the seeded demo account. *"All screens
render correctly"* was true and proven. *"A user can actually use this"* was never asked.
**A demo seed is a rendering fixture, not proof of a usable product.**

### 10.2 False greens — tests that pass while being wrong

- **An unscoped assertion query** (S8) filtered only by `external_id`, not `user_id`. Every run
  created a fresh user but reused the same literal fixture UID, so the query silently matched rows
  from *every prior run*. The count grew 2 → 3 → 4, which looks like healthy accumulating data.
  It passed every single time. Now **D18**: every integration-test assertion query against a shared
  local database must be scoped by its actual isolation key.
- **Green once is not green** (D14). Re-running new integration tests is what surfaced S8.
- **A guard that could not fail.** The RLS coverage test was broken such that it always passed.
- **A test fixture reintroduced a bug the product had already fixed** — `new Date().toISOString()`
  for a day boundary, the exact B4 bug, in a Playwright fixture.
- **`getComputedStyle` on an unfocused element** returned a plausible wrong answer for a
  `:focus-visible` rule, and that artifact was reported as a session's most severe finding before
  being disproved with CDP matched-rules output.
- **A green `npm run verify` says nothing about what is committed** (D21).

### 10.3 Day boundaries derived from UTC

The single most-repeated bug in the project. **B4 fixed it across 15 measured sites** in the domain
layer; it then reappeared in test fixtures. This product is about *local days*. There are SQL
helpers and TS helpers for it. `docs/DATA_MODEL.md` has the section. **Never write
`new Date().toISOString().slice(0,10)`.**

### 10.4 Real zero collapsing into absent

Happened at least three times, **once inside the fix for itself.**
`return total > 0 ? total : null` makes a sub-minute focus session render identically to no session
at all. The correct shape is always three-way: *nothing recorded* / *recorded, below the display
threshold* / *the value*. Related standing rule: **never fabricate a value** — `—` or omit, never a
placeholder number.

### 10.5 The verification harness lying about the platform

Four distinct classes, each found independently (§9.4). The meta-lesson is that **the convenience
of a harness silently narrows what "verified" means**, and nobody notices until something fatal
slips through. "Expo Web is the mobile verification path" was inherited across sessions and never
re-examined until it had cost a fatal, user-visible bug.

### 10.6 "Latest" is not "correct"

Seven documented version landmines (`.brain/memory/versions.md`). TypeScript 7, Jest 30, RN 0.87
and ESLint 10 would each have broken the build in a way that *looks like success*. Also Tailwind
v4's built-in `max-w-prose` (65ch) silently winning over a same-named custom `@theme` token, and
Tailwind v4 requiring the `--z-index-*` namespace.

### 10.7 Environment / tooling traps that cost real time

Full list in `.brain/memory/tooling-gotchas.md`. The most expensive:

- **Edge functions return 503 locally because no runtime container is running.** `supabase start`
  brings up **no edge runtime**. Every edge function had returned 503 for the entire build and
  nobody had noticed. Run `supabase functions serve --env-file ./.env.local`.
- **Kong holds stale upstreams after `supabase db reset`.** `npm run db:reset` now restarts Kong
  for this reason. Symptom without it: everything looks up, nothing routes.
- **`idb ui text` silently corrupts input** — dropped characters, cursor jumps, stale values,
  including on genuinely fresh fields. The iOS QuickType keyboard also *learns and re-injects*
  typed strings. This is what made simulator-driven verification unreliable and pushed everything
  onto Expo Web (see 10.5 for what that cost).
- **Never run native prebuild** (`expo run:ios`, `expo prebuild`). We stay in the managed workflow.
  A prebuild killed mid-write once zeroed `apps/mobile/package.json`.
- **Expo Router bundles *any* file under the app root, including tests.** Mobile tests must live
  outside `src/app/` — they live in `apps/mobile/__tests__/`.
- **"Signed in, then instantly signed out"** after restarting the Supabase stack — a stale JWT
  against regenerated local keys.
- **Reanimated's built-in `useReducedMotion` is static** — do not use it; there is a local hook.
- **Local GoTrue reads `config.toml` at container start** (D13). Editing it without a restart
  changes nothing and looks like a code bug.

### 10.8 Coordination failures (multi-agent work)

- **Shared git index.** Two agents in one working tree; a bare `git commit` sweeps in whatever a
  peer has staged. Now **D22: commit by pathspec** — `git commit -m "…" -- <paths>`.
- **Shared infrastructure churn.** Dev servers and Metro instances were killed out from under
  whoever owned them, repeatedly, and one kill was never explained. Explicit port/process ownership
  had to be established mid-session.
- **Crossed assignments.** Both engineers were assigned the same work within minutes of each other
  and one was seconds from duplicating the other's. When switching an engineer's lane, tell the
  *other* engineer immediately.
- **Stale doc rows.** At least three FOLLOWUPS rows described as open were already resolved — one
  feature was nearly rebuilt from scratch. **A doc row is a claim about the past. Re-verify against
  HEAD before acting on one.**

---

## 11. Durable decisions — do not reverse without reading them

`.brain/memory/decisions.md` holds **D1–D22** in full with reasoning. The ones most likely to be
reversed by someone who doesn't know why:

| | |
|---|---|
| **D4** | Internal packages are **source-resolved** (no `dist`). A build step reintroduces a stale-dist trap. |
| **D6/D7** | Risk is weighted-additive, not the brief's pure product; missing factors are **excluded and renormalized**, never defaulted. |
| **D8** | Crash plans may never drop the submission. |
| **D9/D10** | The LLM never calculates and never chooses what matters; extraction **never auto-writes** academic data. |
| **D13** | Local GoTrue reads `config.toml` at container start. |
| **D14** | Every integration test must be idempotent — and run twice. |
| **D16** | `packages/core` is mirrored into the Deno directory; **the staleness guard is load-bearing.** |
| **D17** | `pg_cron`/`pg_net` work locally; scheduling is gated on a **Vault secret**, not extension availability. |
| **D18** | Every integration-test assertion query must be scoped by `user_id`. |
| **D19** | `private.*` functions need an explicit `public` wrapper. Don't "simplify" by exposing the schema. |
| **D20** | A component isn't done until something in the **real request path** calls it. |
| **D21** | A green `verify` says nothing about what is **committed**. |
| **D22** | In a shared tree, **commit by pathspec**. |

---

## 12. How to work here

```bash
npm run db:start          # local Supabase (Docker must be running)
supabase functions serve --env-file ./.env.local   # edge runtime — NOT part of db:start
npm run db:reset          # re-apply migrations + seed, and refresh Kong
npm run db:types          # regenerate database.types.ts — after EVERY migration change
npm run verify            # 4 guards → typecheck → lint → test. Must exit 0.
npm run db:test           # pgTAP (RLS + constraints)
npm run test:e2e          # Playwright, real stack
npm run test:integration --workspace=@collegeos/api
npm run make:test-user    # a throwaway account to write against
npm run clean:test-users  # they accumulate; run this periodically
cd apps/mobile && npx expo start --web --port 8082   # read §9.4 before trusting this
```

**Working agreements that earned their keep:**

- **Verify before claiming.** Paste real command output. **Typecheck is not evidence.**
- **Green once is not green** — run new integration tests twice (D14).
- **An inspection tool is not an interaction test.** Reading the DOM, the styles and the props of a
  control is not the same as using it. This cost a fatal bug.
- **Never fabricate a value.** `—` or omit, never a placeholder number. This extends to layout (a
  page that ends where its content ends is not a defect) and to thresholds.
- **A doc row is a claim about the past.** Re-verify against HEAD before acting on one.
- **Ask "and then what happens?"** of every feature you finish. Five features in this codebase
  needed that question and didn't get it.
- **Behaviour and information may never diverge across platforms; layout and idiom may.**
- **Don't widen scope.** If you find an unrelated problem, report it — don't fix it silently.
- **Every LLM response is schema-validated.** Every extracted deadline requires explicit
  confirmation. Every user-scoped table has RLS. These are not negotiable.
