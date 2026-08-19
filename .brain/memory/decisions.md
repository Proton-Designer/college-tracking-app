# Durable Architecture Decisions

Append-only. These survive context compaction. Do not silently reverse one — supersede it with a
new dated entry explaining why.

## D1 — Monorepo with two UI shells, one shared brain
`apps/web` (Next.js) + `apps/mobile` (Expo) over `packages/core` + `packages/api` + `packages/design`.
**Why:** the product needs a real desktop landing page *and* a native mobile welcome screen —
different surfaces with different craft requirements that `react-native-web` would compromise.
**Divergence control:** UI shells own layout and interaction ONLY. If a component computes a domain
value, that computation belongs in `packages/core`. This rule is the entire defense.

## D2 — Supabase Edge Functions are the only backend
Not Next.js route handlers. **Why:** mobile needs the same backend as web; one backend, one place
for the Anthropic key. Route handlers would force a second backend for mobile.

## D3 — Build against local Supabase; cloud is a swap, not a rewrite
Full local stack (Postgres 17.6, GoTrue, PostgREST, Storage, Edge). Every schema change is an
ordered migration that applies identically to cloud. `docs/SUPABASE_SETUP.md` accumulates every
cloud-only step. **Payoff:** real auth, real RLS, real email flows testable tonight.

## D4 — All internal packages are source-resolved (no dist)
`main`/`types`/`exports` → `./src/index.ts`. **Why:** consumers are Turbopack, Metro, Vitest, and
Deno — all handle TS source. A dist step buys nothing and costs a stale-dist trap plus
build-ordering for typecheck. "I rebuilt but it didn't update" is a bug class an unattended build
cannot afford. *(Adopted from Nova's `packages/api` setup, extended to all packages.)*

## D5 — Version pins that must not be casually bumped
- `typescript@5.9.3` — TS 7.x is a Go-native rewrite with **no stable language-service API until
  7.1**; `typescript-eslint` peer-requires `<6.1.0`. Bumping silently breaks lint across both apps,
  which *looks like success*. Revisit at 7.1 GA.
- Mobile deps installed **only** via `npx expo install`, never hand-picked. Expo's npm `latest` has
  wildcard peers that would pull RN 0.87 against an SDK tested on 0.86.2 → native ABI mismatch.
- `eslint@9.39.5` — 10.x is weeks old; not worth discovering its flat-config edges unattended.
Full detail in `.brain/memory/versions.md`.

## D6 — Risk engine: weighted-additive, not the brief's pure product
The brief's `risk = a × b × c × ...` is rejected: one zero factor annihilates the score, and
per-factor attribution isn't well-defined — which would break the "Why:" explanation the product
depends on. Replaced with a weighted sum × a single urgency salience multiplier. Preserves the
intent (distant work is damped, never zeroed) and stays attributable.

## D7 — Missing factors are excluded and renormalized, never defaulted
Defaulting a missing factor to `0` biases risk **downward** by its full weight (every course gets a
free discount before grades are entered — exactly when the radar matters most). Defaulting to `0.5`
**fabricates an observation**. Instead: exclude, renormalize remaining weights, and derive
`confidence` from the missing mass. Trace returns `missingFactors[]` so the UI can prompt for the
input that would fix it.

## D8 — Crash plans may never drop the submission
A naive "keep the largest phases" crash plan drops `final (.10)` while keeping `draft (.30)`,
producing a paper that is **never submitted**. Terminal artifact-producing phases are
`required: true`, reserved before greedy allocation. If capacity can't cover them, return
`infeasible` — "this cannot be done in the time available" is a legitimate output; silently
omitting submission is not.

## D9 — The LLM never calculates and never chooses what matters
Deterministic code computes every number and ranks every candidate (by risk reduction per
calibrated minute); Claude phrases the rationale from the provided trace. Insight confidence is
stored as `min(model_claimed, code_permitted)`. Without these, the product becomes an LLM with
opinions about someone's life instead of an engine with evidence.

## D10 — Extraction never auto-writes academic data
Syllabus extraction lands in staging with the verbatim source snippet per item; nothing reaches
`assignments`/`exams`/`grade_categories` without explicit user confirmation. A silently-moved exam
date is the most damaging failure this product could produce.

## D11 — `@collegeos/api` uses platform subpath exports
`.` (universal: env, auth logic, data layer, types) · `./web` (browser + server clients,
`@supabase/ssr`) · `./native` (AsyncStorage client, `react-native`).

**Why:** a flat barrel that re-exported the native client made `apps/web` transitively bundle
`react-native`, and the production build died on Flow syntax inside `node_modules/react-native`.
Typecheck was clean throughout — only a real `next build` surfaced it. Neither platform-specific
entry is reachable from the main barrel.

**Rule:** anything importing a platform-only dependency goes behind a subpath. Never re-export it
from `src/index.ts`.

## D12 — `npm run verify` must mean something
`verify` = `check:imports → typecheck → lint → test`. `scripts/check-imports.mjs` guards D4:
`.js`-suffixed relative imports typecheck fine under `moduleResolution: "bundler"` but break
Turbopack and Metro at runtime. It caught **109 latent violations**, 70 of them in `packages/core`,
which would all have detonated at once on L4's first domain import and looked like an L4 bug.

**Rule:** typecheck alone is not acceptable evidence in this repo. Any report claiming a layer works
must include a real `npm run build` for web and, where relevant, a Metro bundle.

## D13 — Local GoTrue reads `config.toml` at container start
Editing `enable_confirmations` and running `supabase db reset` is **not** enough — the auth
container keeps its old `GOTRUE_MAILER_AUTOCONFIRM`. Requires `supabase stop && supabase start`.
Verify with `docker exec supabase_auth_college-app printenv | grep AUTOCONFIRM`.

## D14 — Every integration test must be idempotent
Three test-isolation failures in one session (shared `demo@collegeos.app` credential; test users
accumulating to 14 against a seed of 1; a guard test that destroyed its own precondition via
`force:true`, passed once, then failed on every re-run).

**Rule:** a test either creates its own preconditions and cleans up, or makes no assumption about
state a prior run could have changed. **Run any new integration test at least twice consecutively
against the same database before reporting it green.**

*Green once is not green.* A test that passes on a clean database and fails on the second run is
worse than a failing test — it certifies correctness right up until someone else runs the suite and
blames their own change. A suite that only passes after `db reset` is not a suite, it's a ritual.

## D15 — Realistic seed data is a bug-finding tool, not set dressing
Two real product bugs were found only because the seed models a genuine 10-week semester:
1. Calendar events rendered as "actual" before they had started, so the Day Trace's pen drew ahead
   of the live cursor — found by looking at a real 2am render.
2. `overdueTaskCount` was unbounded while every sibling Recovery Mode signal is near-term, so three
   abandoned tasks would have made Recovery Mode a **permanent** state — destroying a feature whose
   meaning depends on being exceptional.

Both were invisible to unit tests, which pass happily against constructed fixtures. Keep the seed
realistic and keep verifying against it rather than against mocks.

## D16 — `packages/core` can't be imported directly into a Deno Edge Function
L7's nightly/weekly analysis needs the real domain engine (risk traces, planning-execution
diagnosis, bounce-back, friction distribution) — `risk_snapshots`/`grade_snapshots`' own migration
comment says these are "written by the nightly job," so the recompute has to happen there.

Confirmed live, not assumed from docs: `deno check --unstable-sloppy-imports` resolves
`packages/core`'s extensionless relative imports fine via the full Deno CLI, but the actual
deployed Edge Runtime (`supabase-edge-runtime`, distinct from the CLI) rejects them outright at
boot — `Module not found` — even with the identical `unstable: ["sloppy-imports"]` setting in
`deno.json`. Verified by deploying a real test function both ways, not by reading documentation.

Alternatives considered and rejected:
- **Give `packages/core` a `.js`-extensioned dist build.** Reintroduces the build-ordering/stale-dist
  trap D4 exists to eliminate, for every Node/bundler consumer, to satisfy one Deno consumer.
- **Run the nightly job on a plain Node host instead of an Edge Function.** Architecturally fine,
  but there is no Node host in this stack — Supabase gives us Edge Functions for server-triggered
  work.
- **Reimplement the needed logic natively in Deno.** Rejected outright: two implementations of the
  risk engine, drifting apart silently, is the single worst outcome available for a product whose
  entire premise is that the numbers are trustworthy.

**Rule:** `supabase/functions/_shared/core/` is a **generated, mechanical mirror** of
`packages/core/src` (`scripts/build-core-for-deno.mjs` — appends `.ts` to same-package relative
import specifiers and changes nothing else; never hand-edited, see the mirror's own README.md).
`npm run verify` runs `scripts/check-core-mirror.mjs`, which regenerates the mirror in memory and
diffs it byte-for-byte against the committed version, **failing loudly** (not auto-regenerating) on
any difference. Auto-regen-and-continue was explicitly rejected: it would hide drift and could
silently pull an unreviewed `packages/core` change into the deployed edge path without anyone
looking at the diff first. A stale mirror means the nightly job scores risk and projects grades
with different domain logic than the apps display — divergence that only surfaces as "why does my
report disagree with my Today screen?" months later, categorically worse than the `.js`-import bug
(D12) or the silently-skipping test suite (in spirit, D14) this same guard pattern already caught.

Same reasoning will apply to any future Edge Function needing `packages/api`'s day-layer
query/compute functions (not just `packages/core`) — scope that out explicitly if/when it's built,
rather than assuming the mirror already covers it.

## D17 — `pg_cron`/`pg_net` actually work on the local stack; gate scheduling on a Vault secret, not extension availability

An earlier, unverified note (docs/SUPABASE_SETUP.md §8) claimed `pg_cron`/`pg_net` "are not present
in the local stack." Never actually tested — corrected after live verification while building L7's
cron scheduling migration. Both extensions are present and fully functional locally: `create
extension if not exists pg_cron` succeeds, `cron.schedule(...)` registers a real job, and — the part
that matters — a scheduled job actually **fires**: `net.http_post` issued from inside the `db`
container reaches the local Edge Runtime at `http://kong:8000/functions/v1/<name>` (the `db` and
`kong` containers share `supabase_network_college-app`; `127.0.0.1:54321` is host-only and unreachable
from inside another container), and produces a real stored `agent_reports` row end to end. Proven with
the exact SQL `supabase/migrations/00000000000014_scheduled_jobs.sql` registers, not a simplified
stand-in.

Since the extensions genuinely work, an "is pg_cron installed" guard would not have stopped a fresh
`npm run db:reset` from silently scheduling real nightly/weekly jobs against every seeded local
profile — including `demo@collegeos.app`, whose entire value is its stable, curated data (same
concern the "reads against demo, writes against a throwaway" rule exists for). The migration
therefore gates actual job **registration** (not extension creation) behind three Vault secrets
(`cron_shared_secret`, `edge_functions_base_url`, `edge_functions_anon_key`) that nothing sets by
default — a fresh reset registers zero jobs (`select count(*) from cron.job` → `0`), and an operator
opts in explicitly via `vault.create_secret(...)`, documented in SUPABASE_SETUP.md §8. The pg_cron-
extension-availability check still exists too (wrapped in an exception-handling `DO` block, for hosts
that genuinely lack it), but it is a secondary guard, not the one doing the actual safety work.

Also discovered live during this verification: the real job's date math (`addDays(localDateFromInstant
(now, tz), -1)`) and seed.sql's hand-authored nightly-report fixture (`current_date - 1`) land on the
same `(user_id, report_type, local_date)` key the day after a reset — running the real job against
demo silently overwrote and then (via cleanup) deleted the seed fixture, recovered by another
`db:reset`. Documented as an operational caution in SUPABASE_SETUP.md §8, not fixed in code: the
upsert-replaces-not-duplicates behavior itself is correct for real users, this is purely a fixture-
data collision.
