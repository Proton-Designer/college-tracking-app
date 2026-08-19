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
| 🟡 S4 | **`pg_cron` not verified locally** | Available (1.6.4) but not installed; may need `shared_preload_libraries`. Cron registration SQL is written to no-op when the extension is absent. Verify on cloud deploy. |

---

## Nice to have 🟢

| # | Item | Notes |
|---|---|---|
| 🟢 N1 | **Mobile has no calibrated-grid texture** | Accepted platform divergence — sub-perceptual at phone viewing distance; not worth a dependency or asset pipeline. Documented in `DESIGN_SYSTEM.md` §6.3 as a *decision*, not a TODO. Revisit at L11 if mobile reads flat beside web. |
| 🟢 N2 | **iPhone 17 Pro simulator record is corrupt** | "Unable to boot deleted device." Using iPhone 16 Pro. `xcrun simctl delete` + recreate when convenient. |
| 🟢 N3 | **`globalMeanStartDelayDays = 1.5` is a prior, not a measurement** | Correct for a single-user product with no population to average. Named constant, commented, and confidence downgrades when used. Revisit only if the product ever has multiple users. |
| 🟢 N4 | **`completedUnits`/`plannedUnits` derived from tasks** | Proxy for the brief's "planned study sessions." No dedicated units column. Acceptable — tasks are the real signal available. |
