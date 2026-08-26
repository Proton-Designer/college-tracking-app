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

## D18 — Every integration-test assertion query must be scoped by `user_id`
Companion to D14. An unscoped assertion query against a shared database is not an assertion about
*your test's* behavior — it is an assertion about the **whole table's history**.

Found live: an itest asserting on `external_id` with no `user_id` filter silently matched rows from
every previous run's throwaway user (2, then 3, then 4). It passed every time while proving nothing.
This is the sneakiest member of the false-green family, because the growing row count reads as
healthy accumulating data rather than a broken assertion.

**Rule:** scope every assertion query by `user_id` (or another per-test discriminator). If a count
can grow across runs without the code changing, the assertion is measuring the wrong thing.

Surfaced by D14's run-it-3× rule, which has now caught two distinct bugs it wasn't designed for.

## D19 — `private.*` functions require an explicit `public` wrapper to be callable
`private` is excluded from PostgREST's exposed schemas, so `private.*` is unreachable via `.rpc()`
from **anywhere** — browser, mobile, or Edge Function, with anon or service_role. The Vault
functions were pgTAP-proven since L1 but had **zero real call path**, because pgTAP exercises them
over direct SQL and bypasses PostgREST entirely.

The property we want is *"private functions are not exposed **by default**"*, not *"can never be
called."* A wrapper makes exposure an explicit, reviewable, per-function decision.

**Rejected:** exposing the `private` schema wholesale (makes the name a lie; flips the default so
every future function is reachable without anyone deciding it should be). **Rejected:** a direct
Postgres connection from the Edge Function (creates a second data-access path with different auth
semantics — some under RLS via PostgREST, others raw service-role SQL — which is exactly where RLS
bypasses accumulate, plus pooling and secret cost).

Every wrapper: `SECURITY DEFINER` with `set search_path = ''` and fully-qualified references (an
unpinned search_path here is a privilege-escalation vector); **re-asserts** the authorization check
rather than trusting the implementation beneath it; `REVOKE ALL FROM PUBLIC, anon` then explicit
`GRANT EXECUTE`; and carries its **own** pgTAP refusal proof — the wrapper is the reachable surface,
so proving the implementation safe does not prove the wrapper safe.

Full reasoning in `docs/DATA_MODEL.md`. Migration `00000000000018`.

## D20 — A component isn't done until something in the real request path calls it
Four instances in a single session, all of **correct, fully-tested code that shipped unreachable**:

1. `getNightReviewDraft`/`getPredictionForDate` — built correctly, never exported from the
   `packages/api` barrel. Blocked the other engineer for hours; the fix was one line.
2. Three L7 modules (`agentReports`, `summaries`, `insights`) — same shape, same cause.
3. `private.store_oauth_token`/`get_oauth_token` — pgTAP-proven since L1 with **zero** real call
   path. PostgREST cannot reach the `private` schema at all; pgTAP exercises it over direct SQL and
   therefore could never have caught it. Found only when a first real caller appeared, at L10.
4. `ingestWhoopTelemetry` — built, tested, and invoked by nothing; the webhook verified, resolved,
   and acked without ever fetching or ingesting.

**Why unit tests structurally cannot catch this:** in every case the defect was not *in* the
component. It was the **absence of an edge** connecting it to a caller. Tests passed, coverage
looked healthy, review found nothing — because there was nothing wrong with the code under test.

**Rule:** when you finish a component, **name its production caller out loud.** If the honest
answer is "its test," it is not done.

Partial mitigation exists: `scripts/check-barrel-exports.mjs` catches cases 1 and 2 mechanically.
Cases 3 and 4 are not mechanically detectable — they need the habit.

## D21 — A green `npm run verify` says nothing about what is committed
In a shared working directory with two engineers, `verify` passing means only that **the combined
uncommitted state of both people happens to typecheck at this instant.** It says nothing about what
is in history, what survives a checkout, or what the other engineer may still reshape.

Found the hard way: one engineer saw a schema change in the working tree, confirmed `verify` was
green, and began building a UI section against it. The change was another engineer's *paused,
uncommitted* work. The Lead then compounded it by checking `git status` on one directory, missing
that the rest of the same batch lived under `packages/core/`, and telling him the remainder was
safe. It wasn't.

**Rules:**
- **Check `git status` before depending on anything you did not write.** `M` or `??` means "someone
  is mid-thought," not "this is ready."
- **If you pause work another engineer might touch, say so explicitly.** Uncommitted work in a
  shared directory is invisible to everyone except its author — right up until someone builds on it.
- **Never let your commit depend on files someone else has not committed.**
- Green `verify` is evidence about *correctness*, never about *stability*.


---

## D22 — In a shared working directory, commit by pathspec, never by index

**Decision:** always `git commit -- <paths>` (or `git commit <paths>`), never `git add <paths>`
followed by a bare `git commit`.

**Why.** Two agents working in one checkout share **one git index**. On 2026-08-22 the Lead staged
ten files for the U9 commit and ran `git commit`; the commit also contained 78 lines of
`docs/FOLLOWUPS.md` that Atlas had staged moments earlier for his own work. Nothing failed, nothing
warned, and the content was correct — it was simply attributed to the wrong commit and the wrong
message. Atlas noticed and said so.

This is **worse than D21**, which says a green `verify` tells you nothing about what is committed.
D21 is about *uncommitted* work being invisible. This is about *someone else's* work being
committed by you, silently, under a message that describes something entirely different — which
corrupts the one record we rely on for "why was this changed."

`git commit -- <paths>` builds the commit from those paths alone regardless of what else sits in the
index, so a peer's staged work cannot be swept in.

**Corollary:** `git commit -a` is banned outright in this repo for the same reason, and more
obviously so.

**How we found it:** not from a failure. Atlas read his own diff after the fact, saw his writing
under someone else's commit message, and reported it rather than shrugging. Reviewing what you
actually committed — not just what you meant to commit — is what caught this.

## D23 — No Chain. Bounce-back stays the recovery metric (2026-08-24)
`docs/BLUEPRINT.md` (Part IV-A, Part VII) specifies a Seinfeld chain calendar of consecutive Days
Won, with earned repair tokens patching a gap. **Ruled against.** `packages/core/src/bounceback/`
already carries the opposing position in its own header — *"Measures time-to-recovery, not
streaks"* — and that stays the core metric.

**Why the blueprint's own argument does not overturn this.** The blueprint reaches for the Chain to
get loss-aversion pull, then immediately has to defuse it: repair tokens, decaying scores, no-shame
copy. Those mitigations exist because the habit research it cites says streaks cause guilt-churn and
quit-events. Bounce-back measures the thing the mitigations are trying to protect — how fast you
came back — **directly**, with no guilt mechanic to defuse. Adopting the Chain would mean building a
motivational device and its own antidote, when the antidote alone is the better instrument.

**What is kept from that part of the blueprint:**
- **Day Won** — hitting a per-weekday baseline. A per-day binary against a standard, not a streak,
  and compatible with bounce-back.
- **The Wall** — the proof surface. It only ever grows and carries no penalty, which is exactly the
  "proof compounds, never debt" property (Part VII item 6) the Chain was meant to deliver.

**What is not built:** consecutive-day counters, chain calendars, repair tokens, `chain_repair_used`.

**Consequence:** the `days` table drops `chain_repair_used`. Recovery is surfaced as bounce-back
(time from a missed baseline back to a Day Won), reusing the engine that already exists rather than
adding a second, competing notion of consistency.

This is a deliberate divergence from the blueprint, made by the repo owner on 2026-08-24, not an
oversight. Do not reintroduce the Chain without superseding this entry.

## D24 — /day and /today merge, Work Engine as the base (2026-08-24)
Phase 1 shipped the Work Engine (`/day`: Hours, Delta, baseline, Day Won) alongside the existing
academic `/today` (MITs, risk, calendar). Two surfaces now answer the same question — "what am I
doing today" — which is a transitional state, not a design.

**Ruled:** they merge in Tier 2, with the **Work Engine surface as the base**. Hours/Delta/baseline
is the spine; School Today and the day's tasks feed into it. `/today` stays the default open until
that merge, after which the merged surface becomes the default and post-login routing follows it.

**Why this direction and not the reverse.** `docs/BLUEPRINT.md` Part II makes the Deep Work Hour the
spine of the app and everything else a layer hanging off it. Part V states that the Academics module
adds a planning brain feeding the existing touchpoints and explicitly "adds no fourth daily
touchpoint". Part X bans a second daily ritual outright. Merging the academic day *into* the Work
Engine satisfies all three; merging the Work Engine into the academic Today would invert the stated
spine and leave Hours as a feature of a to-do screen.

**Consequence for Tier 2:** School Today is a *section and a feed*, not a screen. Building a
standalone academic Today surface in Tier 2 would be building toward a shape this entry has already
rejected.

## D25 — "Tier 5 scheduler intelligence" means the S4 block (2026-08-26)
No Tier 5 was ever defined in this repo. The owner's continuous-run queue names "Tier 5
scheduler intelligence"; ruled (as an interpretation, flagged for the consolidated
validation pass) to mean the blueprint's S4 block minus what other gates hold:

- **Backward-planned exam retrieval curves** (BLUEPRINT 5.3's exam row): retrieval at
  D-21/-14/-7/-3, timed practice tests at D-7 and D-2 (a practice test IS retrieval, so
  it replaces the colliding D-7 session), light review D-1. Derived on read in core —
  no scheduler state to drift, same argument as migration 42's header.
- **3-week load forecasting** (5.5): planned minutes per day against the per-weekday
  baselines (migration 38's map via baselineForWeekday), overflow named now rather than
  discovered on Sunday night.
- **Practice-test benchmark rules** (5.6 rule 1): a practice_tests table, the
  practice-high-real-lower gap rule, and the reserved questions.origin='missed'
  conversion (migration 42 reserved it for exactly this).
- **Feedback rules 5.6 where data exists**: the >15% calibration gap already ships (S3);
  the queue-shrink rule is inherent in SM-2's intervals; practice-vs-real lands here.
  "I knew it but blanked" needs an exam post-mortem surface (not built — no tag exists);
  afternoon-focus/sleep rules need Whoop (I2 — excluded, the one S4 item that is
  genuinely credential-gated).

If the owner meant something else by Tier 5, the consolidated test plan surfaces the
mismatch cheaply — the plan doc's own reasoning, adopted.
