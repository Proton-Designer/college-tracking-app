# Deferred Items & Known Follow-ups

> Running list maintained by the Lead. Everything deliberately deferred, deferred-with-reason, or
> noticed-but-not-yet-fixed lands here so it is tracked rather than forgotten. Nothing is dropped
> silently — that's the same standard the product itself is held to.

**Status:** 🔴 must fix before launch · 🟡 should fix · 🟢 nice to have · ⚪️ scheduled to a later layer

---

## Scheduled to a later layer (not defects)

| # | Item | Layer | Notes |
|---|---|---|---|
| ⚪️ F1 | **Focus session launcher** omitted from Today | L6 | No write path exists. Deliberately *not* stubbed — a "Start focus" button that persists nothing is a fake feature. L6 builds start/stop, interruptions, subjective focus, objective output, proof-of-work, and `/focus/[sessionId]`. |
| ⚪️ F2 | **Kill-list section** omitted from Today | L6 | `kill_habits`/`kill_events` have no backend. Omitted rather than faked. |
| ⚪️ F3 | Brightspace `ics_url` stored plaintext | L10 | Ruled: it's a **bearer credential** (grants calendar access by possession, long-lived, not user-rotatable). Moves to Vault when the integration is built. |

---

## Scope gaps caught in audit (Lead's assignment errors)

| # | Item | Notes |
|---|---|---|
| 🔴 A1 | **Night review UI never assigned** | `MASTER_PLAN` L4 is "Today, morning check-in, **night review**, tasks." The L4 assignment specified Today + check-in and omitted the night review. `/review` exists on neither platform. This is the **Reflect** step of the closed loop — without it a user can plan a day but never close it, and friction logs, prediction scoring, calibration actuals, and **L7's nightly analysis all have no input**. Backend (`submitNightReview`) already exists. Queued to Nova after mobile Today. |

| 🔴 A2 | **Timeboxing / implementation intentions were never scoped** | The brief specifies a plan as an *implementation intention* — when, where, how (`BME exam prep · 4:30–5:45 PM · WALC library · Ch5 practice`) — and ties it to the research on specific plans outperforming vague ones. `tasks` carried only `planned_date` (a day, no time), so **start delay — a headline metric in the brief ("planned start 4:00 / actual start 5:07") — could not be measured at all.** Caught when Atlas honestly reported start delay as 0 and refused to invent a scheduling concept. Fixed in L6: `tasks.planned_start_at` + `planned_location`, start delay `null` (never 0) when unset. |
| ⚪️ A3 | **Weekly planning (the brief's Sunday session) not yet scoped** | Capacity + deadlines + course risk + unfinished work → suggested focus blocks for the week, adjusted once by the user and carried forward. Depends on the A2 timeboxing primitive. Natural L8/L9 follow-on. |

**Process note:** caught by auditing built routes against `SCREEN_SPEC`, not by either engineer's
report — both engineers correctly built exactly what they were assigned. Layer scope must be
audited against the plan at each boundary, not assumed from assignment messages.

---

## Must fix before launch 🔴

| # | Item | Notes |
|---|---|---|
| 🔴 L1 | **Custom URL scheme (`collegeos://`) is hijackable** | Another app registering the same scheme can intercept an auth callback — on a confirmation or reset link that means intercepting a session. Fix is **Universal Links (iOS) / App Links (Android)**, domain-verified. Needs a real domain + AASA file. Documented in `SUPABASE_SETUP.md` §5. |
| 🔴 L2 | **`exp://127.0.0.1:8081/**` must be removed from the redirect allow-list** | Development only. Annotated in `config.toml`. |
| 🔴 L3 | **Custom SMTP required** | Supabase's built-in mailer is rate-limited and not for production; confirmation emails will silently throttle. |
| 🔴 L4 | **No `ANTHROPIC_API_KEY` yet** | LLM layer is fully built and tested offline against golden fixtures. `SUPABASE_SETUP.md` §7 has the ordered 5-step activation checklist — including: if the live response shape differs from a fixture, **update the fixture from reality, never patch the test to pass**. |

---

## Should fix 🟡

| # | Item | Notes |
|---|---|---|
| 🟡 S1 | **Integration tests depend on a shared mutable credential** | Both suites sign in as `demo@collegeos.app`. Any mutation breaks them, and it surfaces as "sign-in failed" rather than "the fixture moved" — which already cost Atlas debugging time once. Fix: create a throwaway user in `beforeAll`, or assert-and-repair the credential deterministically. |
| 🟡 S2 | **Test users accumulate in the local DB** | Post-restart audit: **14 `auth.users`** and **11 courses** against a seed of 1 user / 5 courses. The E2E test-user factory has teardown, but ~13 orphans suggests it doesn't run on all paths (failed specs, storage-state setup users). Risk: slow drift, and any test that enumerates users gets noisier over time. |
| 🟡 S3 | **Demo user's password hash drifted once, cause unknown** | Verified it was *not* E2E (those use isolated users) and nothing calls `updatePassword` on the demo account. Left explicitly **unexplained** rather than recording a plausible guess as a finding. S1 makes it moot. |
| 🟡 S5 | **No stale-task surface** | `recoveryMode.ts`'s `overdueTaskCount` is now windowed to 7 days (correct — an unbounded count made Recovery Mode a *permanent* state once 3 tasks were abandoned, which destroys the feature). Second-order consequence: tasks older than 7 days now count for **nothing** and nothing surfaces them, so the product silently accumulates dead tasks — violating "nothing the system defers is silent." Needs a periodic prompt: *"these have been sitting three weeks — still real?"* Belongs with friction logging (L6) or insights (L8). A task nobody will ever do is noise in every risk calculation it touches. |
| ~~🟡 S4~~ | ~~`pg_cron` not verified locally~~ | **Resolved (L7).** Verified live: `pg_cron` works fully locally, no `shared_preload_libraries` issue — `cron.schedule()` registers real jobs and they actually fire (`net.http_post` from the `db` container reaches the Edge Runtime via `http://kong:8000/...`, not `127.0.0.1`). See D17 in `decisions.md`. The migration (`00000000000014_scheduled_jobs.sql`) instead gates job *registration* behind a Vault secret existing, so a fresh `db:reset` still registers zero jobs by default — a different, more deliberate safety reason than extension availability. |
| ~~🟡 S6~~ | ~~No automated guard against demo-account contamination~~ | **Resolved (L9).** `scripts/check-demo-clean.mjs` built, wired into `verify`. Dynamically discovers date/timestamp columns via `information_schema` rather than a hardcoded table list. Proved catching real injected contamination both ways (clean pass, then a deliberately-injected 2099 row + a `pow-test-*` title, both caught) — first version silently missed the date-column finding because psql sends `RAISE NOTICE` to stderr and the guard's `execFileSync` call only captured stdout; fixed by switching to `spawnSync` and reading both streams. |
| ~~🟡 S7~~ | ~~No automated guard against unreachable public exports~~ | **Resolved (L9).** `scripts/check-barrel-exports.mjs` built, wired into `verify`. Walks `packages/api/src/**`/`packages/core/src/**`, resolves real reachability by following both named and wildcard (`export *`) re-exports recursively from each package's actual entry points (`packages/api` has three: `index.ts`, `platform/web.ts`, `platform/native.ts`). First run false-flagged `packages/core`'s entire public surface because its barrel is wildcard-only and the initial version only understood named-list re-exports — fixed by resolving and recursively following `export *` targets. `@barrel-internal` opt-out comment for genuinely internal modules (result-constructor helpers, functions that only feed an already-exported aggregate). |
| 🟡 S8 | **Unscoped integration-test assertion queries silently accumulate cross-test-run matches** | Found live at L10 (`syncFeed.itest.ts`): an assertion query filtered only by `external_id`, no `user_id` — since every test run creates a fresh throwaway user (D14) but reused the same literal fixture UID, the query silently picked up matching rows from *every prior run*, not just the current one. The row count grew monotonically (2, then 3, then 4) across repeated runs, which looks like healthy accumulating data rather than a broken assertion — the most dangerous kind of false green, since D14's own "run it 3x" rule is what surfaced it despite the assertion technically passing every single time. **New standing rule** (worth a `decisions.md` entry alongside D14, the Lead's call): every integration-test assertion query against a shared local database must be scoped by `user_id` (or whatever the test's actual isolation key is) — an unscoped query is not an assertion about the test's own behavior, it's an assertion about the whole table's history. |
| 🟡 S9 | **`whoop-webhook` verifies + resolves + acknowledges but does not yet fetch the referenced resource** | WHOOP's webhook payload is a *notification* ("this sleep/recovery/workout changed"), not the measurement itself — completing the loop into `telemetry_events`/`health_daily` needs a second, authenticated call to WHOOP's REST API using the stored access token (refreshing first via `isTokenExpiringSoon` + `refreshAccessToken` if it's expired), then `ingestWhoopTelemetry`. Deliberately not half-built tonight — flagged rather than left silently incomplete. `ingestWhoopTelemetry` itself is already proven end-to-end (`ingest.itest.ts`); only the "notification → fetch → normalize → ingest" wiring inside `whoop-webhook/index.ts` is missing. |

---

## Nice to have 🟢

| # | Item | Notes |
|---|---|---|
| 🟢 N1 | **Mobile has no calibrated-grid texture** | Accepted platform divergence — sub-perceptual at phone viewing distance; not worth a dependency or asset pipeline. Documented in `DESIGN_SYSTEM.md` §6.3 as a *decision*, not a TODO. Revisit at L11 if mobile reads flat beside web. |
| 🟢 N2 | **iPhone 17 Pro simulator record is corrupt** | "Unable to boot deleted device." Using iPhone 16 Pro. `xcrun simctl delete` + recreate when convenient. |
| 🟢 N3 | **`globalMeanStartDelayDays = 1.5` is a prior, not a measurement** | Correct for a single-user product with no population to average. Named constant, commented, and confidence downgrades when used. Revisit only if the product ever has multiple users. |
| 🟢 N4 | **`completedUnits`/`plannedUnits` derived from tasks** | Proxy for the brief's "planned study sessions." No dedicated units column. Acceptable — tasks are the real signal available. |
