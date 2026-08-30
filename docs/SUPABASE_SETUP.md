# Supabase Cloud Provisioning Runbook

> **Purpose.** CollegeOS was built and tested entirely against a local Supabase stack. This
> document is the ordered, complete procedure for standing up the cloud project when credentials
> become available. Follow it top to bottom. Every step is either a CLI command you can paste or a
> named dashboard control with the exact value to set.
>
> **Status legend:** ⬜ not yet done · ✅ done
>
> This document grows as each layer lands. Sections marked *(populated in Lx)* are filled in by the
> layer that creates the requirement.

---

## 0. Before you start

You need:
- A Supabase account and organization
- The Supabase CLI (`supabase --version` ≥ 2.98)
- Docker (only for local work; not needed for cloud deploy)
- An Anthropic API key with a spend limit configured

Nothing in this repository contains production secrets. `.env.local` holds only the Supabase CLI's
well-known local demo keys.

---

## 1. Create the project ⬜

1. https://supabase.com/dashboard → **New project**
2. Settings:
   - **Name:** `collegeos-prod` (and optionally `collegeos-staging`)
   - **Region:** choose the region physically closest to the primary user. This is the single
     largest lever on perceived latency and it **cannot be changed later** without recreating the
     project.
   - **Postgres version:** 17.x (match local — `supabase status` reports the local version)
   - **Database password:** generate a strong one and store it in a password manager. It is shown
     once.
3. Record from **Project Settings → General**: the **Project Reference ID** (`abcdefghij...`).

### Link the local repo to the cloud project

```bash
supabase login                       # opens a browser
supabase link --project-ref <PROJECT_REF>
```

---

## 2. Collect credentials ⬜

**Project Settings → API Keys** and **→ Database**:

| Value | Where it goes | Notes |
|---|---|---|
| Project URL | `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_URL` | public |
| `anon` / publishable key | `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_…`, `EXPO_PUBLIC_…` | public by design; safe in clients **only because RLS is enforced** |
| `service_role` / secret key | `SUPABASE_SERVICE_ROLE_KEY` | **bypasses RLS.** Edge Functions and CI only. Never in `apps/*`. Never in any `NEXT_PUBLIC_*` or `EXPO_PUBLIC_*` variable. |
| Connection string (pooled, port 6543) | app runtime | use for serverless/edge |
| Connection string (direct, port 5432) | migrations only | |

Copy `.env.example` → `.env` and fill it in. Confirm `.env` is gitignored (it is).

---

## 3. Apply the schema ⬜

All schema lives in `supabase/migrations/` as ordered SQL. It has already been applied and tested
locally; the cloud apply is the identical sequence.

```bash
# Dry run — review the plan before touching the cloud database
supabase db push --dry-run

# Apply
supabase db push

# Verify: should report no differences
supabase db diff --linked
```

Then regenerate types against the cloud project and confirm they are unchanged from local:

```bash
supabase gen types typescript --linked > /tmp/cloud.types.ts
diff /tmp/cloud.types.ts packages/api/src/database.types.ts   # expect no output
```

### Extensions required

Enabled by migration (`supabase/migrations/00000000000001_extensions.sql`), but verify under
**Database → Extensions**:

| Extension | Purpose |
|---|---|
| `pgcrypto` | UUID generation, digests (`llm_usage_log.content_hash`) |
| `uuid-ossp` | UUID generation (compat; enabled by default on both local and cloud) |
| `pg_cron` | scheduled nightly/weekly analysis jobs *(wired up in L7)* |
| `pg_net` | HTTP calls from Postgres to Edge Functions (used by cron) |
| `supabase_vault` | encrypted storage of third-party OAuth tokens — see §L1 note below |
| `pgtap` | pgTAP test suite (`supabase/tests/database/`) |

> `pg_cron` and `pg_net` exist on the cloud platform but **not** in the default local stack. Any
> logic depending on them is written to be triggered externally in local development. See §8.

> **L1 note:** on some hosted Supabase plans, `CREATE EXTENSION` from a migration can fail for
> extensions that require dashboard-level enablement (this was true historically for `pgtap` and
> occasionally `pg_net`). If `supabase db push` reports an extension error, enable it manually under
> **Database → Extensions** first, then re-run. `supabase_vault` and `pgcrypto` are standard on all
> plans and should apply from the migration without issue.
>
> `supabase_vault`-backed OAuth token storage (`oauth_connections`, `private.store_oauth_token`,
> `private.get_oauth_token`) is proven working end-to-end locally by
> `supabase/tests/database/02_vault_oauth_tokens.test.sql` — no additional cloud configuration is
> needed beyond the extension being enabled, since Vault's encryption key is managed by the platform
> automatically on both local and cloud.

---

## 4. Verify Row Level Security ⬜

This is the security gate. Do not skip it.

```bash
supabase test db --linked        # pgTAP suite: proves cross-user isolation
```

As of L1 this is 255 assertions across 3 files — notably
`03_rls_cross_user_isolation.test.sql`, which dynamically enumerates every RLS-enabled table with a
`user_id` column (40 as of L1, not a hand-picked subset) and proves a second user sees zero rows
from any of them.

Then confirm in **Database → Tables** that *every* table in the `public` schema shows **RLS
enabled**. A table with RLS disabled is exposed to anyone holding the anon key, which is a public
value. Treat any such table as a live incident, not a TODO.

Also check **Advisors → Security** in the dashboard and resolve every finding.

---

## 5. Authentication ⬜

**Authentication → Sign In / Providers**

- **Email** — enabled
  - Confirm email: **ON** for production (also `enable_confirmations = true` in local
    `supabase/config.toml` as of L1, so the two never drift — the real signup -> email ->
    confirm flow is testable locally via Mailpit. The E2E test-user fixture creates users
    through the admin API with `email_confirm: true`, bypassing this for automated tests.)
  - Secure email change: ON
  - Minimum password length: 10
  - Leaked-password protection (HIBP): **ON**
- **Anonymous sign-ins:** OFF

**Authentication → URL Configuration**

| Field | Value |
|---|---|
| Site URL | `https://<production-web-domain>` |
| Redirect URLs | `https://<prod-domain>/auth/callback`, `http://localhost:3000/auth/callback`, `collegeos://auth/callback`, `exp://127.0.0.1:8081/--/auth/callback` |

> The mobile deep-link scheme (`collegeos://`) **must** be present or OAuth and email-confirmation
> returns will fail on device with an opaque error. The `exp://` entry is for Expo Go development
> only and should be removed before release.

> **Required pre-launch item — custom URL schemes are not a production-safe callback mechanism.**
> `collegeos://` is a *custom* scheme, not domain-verified: any app that also registers the scheme
> `collegeos` can have iOS/Android route the confirmation/reset link to it instead of this app,
> which for an email-confirmation or password-reset link means **intercepting a live session**, not
> just a broken deep link. This is acceptable for tonight's build (local dev, no other app on the
> device claims the scheme) but **must not ship to production as-is**. Before release, migrate the
> mobile redirect to **Universal Links (iOS)** / **App Links (Android)** — `https://` links bound to
> a verified domain via an `apple-app-site-association` file (iOS) and Digital Asset Links file
> (Android), which cannot be claimed by an unverified app. That requires a real production domain
> and hosting the AASA/assetlinks files, both out of scope tonight — tracked here so it isn't
> quietly treated as done.

> **This list is a security control, not a dev convenience — as of L4.** `signUp` and
> `resetPassword` (`packages/api/src/auth/auth.ts`) both accept a caller-supplied `redirectTo`
> that Supabase honors via `emailRedirectTo`/`redirectTo`. This allow-list is the *only* thing
> preventing an attacker-supplied redirect from being honored in a real confirmation or
> password-reset email. **Every entry must be an exact URL — no wildcard hosts, no `*` origins,
> no bare-domain entries that would match an attacker's subdomain.** A permissive entry here turns
> every password-reset email this product sends into a credential-phishing vector. Review this
> list specifically, not just generally, before any cloud deploy. (Local `supabase/config.toml`
> carries the same warning inline next to `additional_redirect_urls`.)

**Authentication → Emails** — replace the default templates with the branded templates in
`supabase/templates/` (confirmation, magic link, password recovery, email change).

**Authentication → Rate Limits** — keep the defaults; they are appropriate for a single-user
product and are the main brute-force protection on the sign-in endpoint.

**Custom SMTP** — the built-in email service is rate-limited and not for production. Configure a
real provider (Resend/Postmark/SES) under **Project Settings → Authentication → SMTP**. Until this
is done, signup confirmation emails will silently throttle.

---

## 6. Storage buckets ⬜

**Storage → Buckets** (also created by migration; verify):

| Bucket | Public | Purpose | Limits |
|---|---|---|---|
| `syllabi` | **No** | uploaded syllabus PDFs | 10 MB, `application/pdf`, `image/*` |
| `proof` | **No** | proof-of-work attachments | 10 MB, `image/*`, `application/pdf` |
| `avatars` | **No** | profile images | 2 MB, `image/*` |
| `sources` | **No** | Learn (ULM) source uploads | 100 MB, `application/pdf` (migration 56) |

All are private and read through signed URLs. Storage RLS policies restrict every object to a path
prefixed with the owner's user id. Verify under **Storage → Policies** that no bucket is public —
syllabi and proof attachments are personal academic records.

---

## 7. Edge Functions & secrets ⬜

### Anthropic — what a key needs to do, and how to verify it (populated at L5)

**As of L5 there is no `ANTHROPIC_API_KEY` in any environment this product has been built
against.** Everything in `supabase/functions/_shared/llm/` was built and tested entirely
offline against golden fixtures (`gateway.test.ts`, `anthropicProvider.test.ts`,
`confirm.test.ts`, `extract.test.ts` — `deno test` from `supabase/functions/`, 32
assertions, zero network calls to Anthropic). **The real API has never been called.**
This section is the checklist for the first time a key exists — local or cloud.

**Secrets to set:**

```bash
# Cloud:
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set LLM_MONTHLY_BUDGET_USD=10   # matches profiles.llm_monthly_budget_usd's
                                                   # per-user default; this is the platform-
                                                   # wide backstop, not the per-user ceiling
supabase secrets set CRON_SHARED_SECRET="$(openssl rand -hex 32)"
supabase secrets list

# Local: add to .env.local (never commit a real key). The Edge Runtime container reads
# it the same way cloud does; a `supabase stop && supabase start` picks up a new
# .env.local value (see D13 in .brain/memory/decisions.md — config/env changes need a
# restart, `db reset` alone does not reload container-level env).
```

### Voyage (embeddings) — optional by design, not by omission (D41)

Anthropic ships no embeddings API, so the Learn pillar's pgvector plan needs a second
vendor. **`VOYAGE_API_KEY` does not exist in any environment this product has been built
against, and the ingestion pipeline does not wait for it.**

```bash
supabase secrets set VOYAGE_API_KEY=pa-...   # optional; see below before setting it
```

Without it, `resolveEmbeddingsProvider()` returns `null`, ingestion runs to completion,
`source_chunks.embedding` / `lessons.embedding` stay null (migration 54's own comment says
this is the expected state), the merge pass clusters by lexical similarity instead of
cosine, and the job records the reason in `ingest_jobs.cursor.embeddingsSkippedReason`.
Nothing fails and nothing is silently skipped — `supabase/functions/_shared/embeddings/
embed.test.ts` and `_shared/learn/ingest.test.ts` both exercise the absent-key path
directly, so it is not a branch that first runs on the day the key arrives.

**Activation, when a key exists:** set the secret, redeploy `learn-ingest`, and backfill
the vectors for sources ingested before it (`source_chunks` / `lessons` where
`embedding is null`). Voyage spend then lands in `llm_usage_log` with
`provider = 'voyage'` (migration 55) and counts toward the same monthly ceiling the
Anthropic calls do — verify with
`select provider, sum(cost_usd) from llm_usage_log where user_id = '<id>' group by provider;`.
Confirm the published `voyage-3.5-lite` rate in `_shared/embeddings/costs.ts` against the
first real invoice; it has never been checked against one.

**Model per call type** (`docs/LLM_LAYER_SPEC.md` §1 — `LlmModel`/`LlmCallType` in
`supabase/functions/_shared/llm/types.ts`):

| Call type | Model | Why |
|---|---|---|
| `syllabus_extraction` | Haiku 4.5 | cheap, structured extraction, no reasoning needed |
| `nightly_analysis` | Sonnet 5 | the main reasoning call, multi-lens |
| `weekly_synthesis` | Sonnet 5 | deeper reasoning over a week |
| `monthly_longitudinal` | Sonnet 5 | trend analysis |
| `semester_retrospective` | Opus 5 | rare, highest-stakes synthesis |
| `coach_chat` | Sonnet 5 | on-demand, user-facing |
| `morning_plan_rationale` | Haiku 4.5 | one line per MIT, cheap |
| `friction_classify` | Haiku 4.5 | trivial classification |
| `deadline_change_detection` | Haiku 4.5 | trivial classification |

**Budget ceiling:** the gateway (`gateway.ts`'s `callLlm`) checks
`getMonthlySpendUsd(userId)` (sum of `llm_usage_log.cost_usd` since the 1st of the
current UTC month, via `budget.ts`) against `profiles.llm_monthly_budget_usd`
(per-user, default `$5.00` — see `docs/DATA_MODEL.md` §10 item 3) **before** making any
HTTP call. A projected spend over the ceiling returns `BudgetExceeded` and the caller
must degrade to the deterministic-only output — this is asserted directly in
`gateway.test.ts`'s budget-breach test (`provider.callCount()` stays `0`).

**Pricing** (`costs.ts`) is date-aware: Sonnet 5 has an introductory rate through
2026-08-31 (`$2`/`$10` per M input/output) stepping to `$3`/`$15` on 2026-09-01. Verify
`costs.ts`'s `PRICE_TIERS` still matches Anthropic's published pricing before relying on
budget numbers in production — this table is transcribed from the brief and dated
2026-08-11.

**Exactly what to verify once a real key exists**, in order:

1. `cd supabase/functions && deno test --allow-net --allow-env _shared/` — confirm the 39
   offline tests still pass unchanged (they must never need the key). **Must run from
   `supabase/functions/`, not the repo root** -- as of P4 (`npm:unpdf` for PDF text
   extraction), running from the repo root makes Deno discover the JS monorepo's own
   `node_modules` via npm workspaces and try to resolve npm: specifiers from it instead
   of its own npm cache, which fails for any package not also installed there even
   though `supabase/functions/deno.json` sets `"nodeModulesDir": "none"` -- confirmed
   live, the setting doesn't override cwd-based discovery for this Deno version (2.9.5).
2. **Live smoke test** (`docs/LLM_LAYER_SPEC.md` §10) — WRITTEN and RUN 2026-08-25:
   `_shared/llm/liveSmoke.ts`, gated behind `LIVE_SMOKE=1`. All three models returned
   OK — forced tool_choice yielded a tool_use block, the input validated against the
   requested schema, and every usage field the golden fixture assumed was present. No
   fixture drift; nothing updated. If a future run disagrees, the fixture is what must
   change — update it from the real response, never patch the test to pass.
3. Trigger a real `syllabus_extraction` call end-to-end with a real syllabus PDF and
   confirm: the staged `syllabus_extractions` rows have real `source_snippet` text
   (not empty), a plausible `extraction_confidence`, and **critically** that nothing
   appears in `courses`/`deliverables`/`grade_categories` until you explicitly confirm
   through `promoteExtraction` — the confirmation gate is the whole point of L5, prove
   it holds against a real model response too, not just the fixture.
4. Check `llm_usage_log` after each of the above: `content_hash` is populated,
   `model`/`call_type`/token counts look right, and — grep the whole row — **no prompt
   or response text appears anywhere in it.**
5. Confirm a deliberately-tiny `LLM_MONTHLY_BUDGET_USD`/`profiles.llm_monthly_budget_usd`
   value actually blocks a real call (not just the fixture-based test).

Deploy:

```bash
supabase functions deploy --no-verify-jwt=false
supabase functions list
```

> `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge
> Functions automatically. Do not set them manually.

**Function inventory** (as of P4):
- `_shared/llm/` (gateway), `_shared/syllabus/` (extraction, confirmation, text-quality
  gate, PDF text extraction), `_shared/http.ts` (the JWT-verification + response-shape
  pattern every function below follows) — callable modules, unit-tested offline, no HTTP
  surface of their own.
- `syllabus-confirm` — deployed, `verify_jwt = true`. The **only** path from a staged
  `syllabus_extractions` row to a real `courses`/`deliverables`/`grade_categories` write
  — see its own header comment for why this must be server-side, not a client call to
  `promoteExtraction`. Verified live: real JWT auth, real course creation, idempotent
  double-confirm refusal (409), cross-user isolation (a second real user gets 404, not
  another user's data), reject path. No Anthropic dependency — fully provable without a key.
- `syllabus-extract` — deployed, `verify_jwt = true`. Downloads the uploaded file,
  extracts its text (`npm:unpdf`, verified live against both a real generated PDF and
  garbage input), then runs the existing text → quality-gate → LLM-gateway → staging
  pipeline. Verified live up through the budget/profile lookup; the actual Anthropic
  call itself still needs the live smoke test above the first time a real key exists —
  without one, this returns a clear 503, not a crash or a silent no-op (confirmed live).

- `nightly-analysis` — deployed, `verify_jwt = false` (cron-triggered, not a user
  session; gated by the `CRON_SHARED_SECRET` header check inside the handler instead).
  Always assembles + stores the deterministic report and daily summary first
  (`_shared/nightly/assembleReport.ts`, `summaryPyramid.ts`), unconditionally; attempts
  model enrichment only after that succeeds
  (`_shared/nightly/runNightlyAnalysis.ts`), and degrades to the already-stored
  deterministic report with an honest `note` on ANY failure in the model path — budget
  breach, schema validation failure, or an unexpected error. `model` is stored as the
  literal string `'deterministic'` when no LLM call ran; it never fakes a model name
  (the pre-existing seed.sql sample nightly report does fake one — `'claude-sonnet-5'`
  on a row that was hand-authored for UI/demo purposes, not model-generated; flagged as
  a known, deliberate discrepancy for /review UI fixture data, not a pipeline bug).
  Golden-fixture proof (`_shared/nightly/runNightlyAnalysis.itest.ts`, real local DB +
  `createFixtureProvider`, no network to Anthropic): the model-entirely-absent case
  produces a complete, useful report on its own; a malformed/truncated model response
  retries once then falls back; a budget breach makes zero network calls
  (`provider.callCount() === 0`) and still stores a report; a valid response is stored
  under its real model name; re-running the same night replaces rather than duplicates
  the row; and a dedicated privacy test asserts `llm_usage_log` rows have no free-text
  column at all (structural, not just substring-checked) so journal text has nowhere to
  leak into. Verified live via `supabase functions serve` + curl against the real demo
  account's seeded Recovery Mode day (2026-07-28): wrong/missing secret → 401, malformed
  body → 400, valid call → a real, rich deterministic report (Recovery Mode correctly
  triggered with its full 7-signal breakdown, zero data gaps). The verification row was
  deleted afterward to leave the demo account exactly as seed.sql curated it.

### Brightspace — iCal calendar sync (built at L10, fully working end to end)

No OAuth, no platform credential, no third-party developer account — a Brightspace iCal
feed is a plain HTTPS URL a student copies from their own account settings. This is why
it's the **only** L10 integration provable entirely offline tonight, and it's the
template the WHOOP/RescueTime sections below should match once real credentials exist.

**The feed URL is a bearer credential, stored in Vault — not the OAuth path, same
destination.** Anyone holding the URL reads the student's full academic calendar
without authenticating; it's long-lived and not user-rotatable. Same `vault_secret_id`
-only shape as `oauth_connections` (`private.store_brightspace_feed_url`/
`get_brightspace_feed_url`, migration `00000000000017`), reachable only through the
`public.*` wrapper functions (migration `00000000000018` — see `DATA_MODEL.md`'s
Integrations section for the full pattern and why `private.*` alone is never
`.rpc()`-reachable at all).

**Extracted calendar data is no more trusted than an LLM extraction.** Every synced
event lands in `ics_event_extractions` (status `pending`) — nothing in the schema can
auto-populate `calendar_events` from it. `brightspace-confirm` is the only path from
staged to real, exactly mirroring `syllabus-confirm`'s confirmation gate. Re-syncing an
already-decided (confirmed or rejected) staged event leaves it untouched rather than
reverting the user's decision.

**A real gotcha for anyone testing an Edge Function against a local server**: from
inside the Edge Runtime container, `127.0.0.1`/`localhost` is the *container's own*
loopback, not the host machine — a fixture HTTP server started on the host (e.g. `deno
serve` on port 8899 for a local ICS file, or any ad hoc test server) is unreachable at
`http://127.0.0.1:8899` from a function's `fetch()` call. Use **`host.docker.internal`**
instead (Docker Desktop's standard host-access hostname on macOS) — confirmed live:
`fetch("http://host.docker.internal:8899")` from inside `brightspace-sync` reached a
real local fixture server and returned real ICS text. Same underlying lesson as the
`pg_cron`/Kong finding in §8 below (`127.0.0.1` inside one container never means the
same thing as `127.0.0.1` on the host, or inside a *different* container).

**Function inventory:**
- `brightspace-sync` — deployed, `verify_jwt = true`. Body `{}` re-syncs the connected
  feed; `{icsUrl}` connects (or reconnects) one first. Fetches the real feed URL via the
  `public.get_brightspace_feed_url` wrapper, `fetch()`s it, parses with
  `icsParser.ts` (packages/core, real RFC 5545 parser — line folding, all-day vs timed,
  TZID resolved via the same Intl double-conversion `localDateFromInstant` uses,
  WEEKLY/DAILY RRULE expansion bounded by a hard occurrence cap), and stages every
  event into `ics_event_extractions`.
- `brightspace-confirm` — deployed, `verify_jwt = true`. The only path from a staged
  row to a real `calendar_events` write. Idempotent (a second confirm on the same row
  is refused, not a silent no-op); a DTEND-less timed event defaults to a 1-hour span
  and a DTEND-less all-day event to one day, since `calendar_events` enforces
  `end_at > start_at` strictly and a zero-duration "point in time" event (valid per RFC
  5545) can never satisfy that on its own.
- Verified live end to end, not just the library calls: deployed both functions, a real
  HTTP fetch from inside the Edge Runtime container against a local fixture ICS server
  (`host.docker.internal`, per the gotcha above), a real staged event, a real
  `brightspace-confirm` call promoting it into a real `calendar_events` row under a real
  signed-in session, double-confirm refusal, re-sync-preserves-the-decision idempotency,
  401 on no auth. Demo confirmed untouched throughout (`check:demo-clean`).

**Exactly what to verify once a real Purdue Brightspace feed URL exists**, in order:
1. Connect a real feed: `POST brightspace-sync` with `{icsUrl: "<the real URL>"}` as a
   real authenticated user. Confirm `ics_event_extractions` fills with real course
   events, not a parse failure — check `malformedLineCount` in the response first;
   nonzero doesn't mean broken, but it's worth eyeballing which lines didn't parse.
2. Confirm the course-matching heuristic (substring match on course code in the event
   summary, `syncFeed.ts`'s `matchCourseFromSummary`) actually matches real Brightspace
   event titles for at least one real course — if Brightspace's real summary format
   doesn't include the course code the way the fixtures assumed, this needs adjusting
   before it's useful, not just working.
3. Confirm a recurring lecture (a real `RRULE` in the real feed, if the account has one)
   expands into the correct number of occurrences on the correct days — the parser was
   proven against hand-built RRULE fixtures, never a real Brightspace-generated one.
4. Confirm rejecting a staged event never touches `calendar_events`, and confirming one
   creates exactly one row with `source = 'ics'`.
5. Confirm re-running `brightspace-sync` doesn't revert any already-confirmed/rejected
   decision, and updates `brightspace_feeds.last_synced_at`.

L10's other three items (WHOOP, RescueTime, generic telemetry ingest) are all built and
offline-proven too — see the sections immediately below.

---

### WHOOP — OAuth2, webhook, and telemetry sync (built at L10, offline-proven end to end)

**No real WHOOP developer credentials exist in any environment this product has been
built against.** Every WHOOP endpoint path, request shape, and response field below is
transcribed from WHOOP's publicly documented API v1 developer reference and OAuth2
guide — **recorded, not verified live.** Everything is proven two ways instead: offline
unit tests stub `fetch` with a golden recorded response shape
(`realProvider.test.ts`, `realResourceFetcher.test.ts`, `webhookSignature.test.ts` — 20
assertions, zero network calls to WHOOP), and the full application logic (account
resolution, token refresh, ingest, rollup) is proven against the real local database
using a fixture provider (`webhookHandler.itest.ts`, `tokenStore.itest.ts`,
`ingest.itest.ts` — 14 assertions). **If the real response shape has drifted by the
time a WHOOP key exists, update the fixtures/mappers from the real response, never
patch a test to force it to pass** — same rule as the Anthropic and Brightspace
sections above.

**Least-privilege scopes to request** at WHOOP's developer portal when creating the
app: `read:sleep read:recovery read:workout read:profile offline` — `offline` is
required to receive a `refresh_token` at all (WHOOP's OAuth2 implementation, like most,
omits it otherwise). No `read:body_measurement` or `read:cycles` unless a future layer
actually consumes them — an unused granted scope is exposure with no product benefit.

**OAuth2 redirect URI** (registered at WHOOP's developer portal, must match exactly
what `whoop-oauth-callback` receives as `redirectUri`):
```
# Cloud:
https://<your-app-domain>/whoop/callback

# Local dev (matches the pattern collegeos:// already establishes for auth callbacks,
# see §5):
collegeos://whoop/callback
```

**Secrets to set:**

```bash
# Cloud:
supabase secrets set WHOOP_CLIENT_ID=...
supabase secrets set WHOOP_CLIENT_SECRET=...
supabase secrets list

# Local: add to .env.local (never commit real values). Restart the stack to pick them
# up (D13 — config/env changes need `supabase stop && supabase start`, `db reset` alone
# does not reload container-level env).
```

**Webhook endpoint to register** at WHOOP's developer portal, once the Edge Function is
deployed:
```
https://<project-ref>.supabase.co/functions/v1/whoop-webhook
```
`config.toml` sets `verify_jwt = false` for this function deliberately — WHOOP has no
Supabase session to present, and the HMAC signature check inside the handler
(`webhookSignature.ts`) *is* the authentication. Do not "fix" this to `true` — it would
just reject every real webhook with 401.

**Credential storage — no schema change beyond `external_account_id`.** The
access/refresh token pair is JSON-encoded and stored as a single string through the
*existing* `store_oauth_token`/`get_oauth_token` wrappers (migration `00000000000018`)
— see `tokenStore.ts`'s header comment. The one real addition is migration
`00000000000019`'s `oauth_connections.external_account_id`, because WHOOP's webhook
identifies the affected account by *WHOOP's own* user id, not ours; it's captured once
at connect time via `WhoopOAuthProvider.getAuthenticatedUserId`.

**A real bug this integration found and fixed, worth knowing about**: `private.
store_oauth_token` (and the structurally identical `private.store_brightspace_feed_url`)
both called `vault.create_secret` unconditionally on *every* call, including a re-store
for an already-connected user+provider — a token refresh, or reconnecting a changed
credential. `vault.secrets.name` is unique, so a second store for the same user+provider
threw a unique-constraint violation, and even without that collision would have silently
orphaned the previous secret forever. Fixed in migration `00000000000020`: reuse the
existing Vault secret in place via `vault.update_secret` when a connection row already
exists. This was pre-existing since L1 and only surfaced because WHOOP's refresh path
was the first real caller to ever re-store — see D20 in `decisions.md`.

**Function inventory:**
- `whoop-oauth-callback` — deployed, `verify_jwt = true`. Body `{code, redirectUri}`.
  Exchanges the authorization code, fetches the WHOOP user id via `/user/profile/basic`,
  stores the token pair + `external_account_id`.
- `whoop-webhook` — deployed, `verify_jwt = false`. Verifies the HMAC signature
  (`X-WHOOP-Signature` / `X-WHOOP-Signature-Timestamp`, 5-minute clock-skew window),
  resolves the account via `external_account_id`, refreshes the token if it's within 5
  minutes of expiring (`isTokenExpiringSoon`, persisting the refreshed token), fetches
  the referenced resource (`sleep.updated` / `recovery.updated` / `workout.updated` —
  a non-"updated" action like a deletion, or an unrecognized resource type, is
  acknowledged without a fetch), normalizes it (`whoopNormalize.ts`), and ingests it
  through `telemetry_events` → `health_daily` (idempotent on the WHOOP resource id via
  migration `00000000000021`'s dedup index, so a retry from a slow ack never
  double-writes). Processes synchronously rather than acking first and backgrounding
  the work — see `whoop-webhook/index.ts`'s header comment for why.
- All logic is behind `handleWhoopWebhook`/`syncRescueTime`-style testable orchestrators
  (`webhookHandler.ts`) so the whole chain has a real, tested caller — not just its
  individual pieces. See D20: a component with a passing test but no caller in the real
  request path is not done.

**Exactly what to verify once real WHOOP credentials exist**, in order:
1. Complete a real OAuth2 authorization against WHOOP's actual consent screen; confirm
   `whoop-oauth-callback` stores a real token pair and the real WHOOP user id lands in
   `oauth_connections.external_account_id`.
2. Trigger a real WHOOP event (log a workout, let a sleep cycle complete) and confirm
   the registered webhook actually reaches `whoop-webhook` with the documented header
   names/signing scheme — this is the single most likely place reality has drifted from
   the recorded documentation, since no real webhook has ever hit this environment.
3. Confirm the resource-fetch endpoints in `realResourceFetcher.ts`
   (`/activity/sleep/{id}`, `/cycle/{id}/recovery`, `/activity/workout/{id}`) match
   WHOOP's real v1 developer API paths — same reasoning as #2.
4. Confirm a real `telemetry_events` row lands with the real source data and
   `health_daily` reflects it correctly for that day.
5. Let a token actually expire (or force it via a short-lived test token if WHOOP's
   sandbox allows) and confirm `refreshAccessToken` is called and the refreshed token
   is persisted — `isTokenExpiringSoon`'s 5-minute window has only been proven against a
   synthetic clock, never a real WHOOP-issued expiry.
6. Send the same webhook twice (WHOOP's own retry, or a manual re-delivery from its
   developer portal if offered) and confirm no duplicate `telemetry_events` row lands.

---

### RescueTime — API key auth, daily summary sync (built at L10, offline-proven end to end)

**No real RescueTime API key exists in any environment this product has been built
against.** Same recorded-not-verified framing as WHOOP above —
`realProvider.test.ts` stubs `fetch` with a golden Daily Summary Feed response shape;
`ingest.itest.ts`/`syncHandler.itest.ts`/`keyStore.itest.ts` (9 assertions) prove the
real application logic against the real local database with a fixture provider.

Simpler than WHOOP in two ways that matter for this checklist: **API-key auth, not
OAuth2** (no redirect URI, no consent screen, no refresh, no expiry — a user pastes
their key from RescueTime's account settings, same "plain credential, not a platform
integration" shape as Brightspace's feed URL), and **pull-only** (no webhook to
register — RescueTime has no push mechanism; sync happens on demand via
`rescuetime-sync`, or on a schedule once wired into §8's cron).

**No new secrets, no new schema.** The API key is stored through the *existing*
`store_oauth_token`/`get_oauth_token` wrappers with `provider='rescuetime'` — already
allowed by migration `00000000000010`'s check constraint, so this integration needed
*zero* migrations for its credential storage. `keyStore.ts` stores it as a bare string
(no JSON envelope, unlike WHOOP's access+refresh pair).

**Function inventory:**
- `rescuetime-sync` — deployed, `verify_jwt = true`. Body `{}` re-syncs using the
  already-stored key; `{apiKey}` connects (or rotates) the key first, then syncs — same
  connect-or-resync shape as `brightspace-sync`. Fetches the Daily Summary Feed
  (returns ~2 weeks of daily rollups per call), normalizes every returned day
  (`rescuetimeNormalize.ts`), and ingests all of it through `telemetry_events` →
  `screen_daily` (`ingestRescueTimeTelemetry`).
- Deliberately **not** idempotent the same way WHOOP's webhook ingest is: a WHOOP
  resource is immutable once created, so a retry safely no-ops; a RescueTime daily
  summary for a recent day is a *live, still-changing* rollup, so a re-sync legitimately
  overwrites `screen_daily` with a bigger total than an hour ago. See `ingest.ts`'s
  header comment for the full reasoning — don't "fix" this to match WHOOP's dedup
  behavior, that would freeze a user's screen time at whatever it read on first sync.
- The sync orchestration (`syncRescueTime`) is a testable function with a real caller
  in `rescuetime-sync/index.ts`, built in the same batch as the ingest logic — applying
  the D20 lesson WHOOP's webhook gap surfaced, not repeating it.

**Exactly what to verify once a real RescueTime API key exists**, in order:
1. `POST rescuetime-sync` with `{apiKey: "<the real key>"}` as a real authenticated
   user. Confirm the Daily Summary Feed's real response shape matches
   `RescueTimeDailySummaryRow` — particularly `all_productive_percentage`/
   `all_distracting_percentage`, the two composite fields this integration relies on
   and the most likely place a real response differs from the documented one.
2. Confirm `screen_daily` populates with real, plausible minute values for at least one
   real day (sanity-check against RescueTime's own dashboard for the same day).
3. Re-run `rescuetime-sync` later the same day and confirm `screen_daily.total_screen_min`
   increases to reflect additional real activity, rather than staying frozen at the
   first sync's value.
4. Confirm a brand-new RescueTime account (no activity yet) syncs cleanly with an empty
   feed rather than erroring.

---

## 8. Scheduled jobs ✅ (local proof) / ⬜ (cloud opt-in)

Nightly analysis and weekly synthesis run via `pg_cron` calling an Edge Function through `pg_net`,
registered by `supabase/migrations/00000000000014_scheduled_jobs.sql`.

**A third job, `learn-ingest-redrive`, is registered by
`supabase/migrations/00000000000059_learn_sources_bucket_and_ingest_cron.sql`** — same structure,
same three Vault secrets, same "a fresh reset registers zero jobs" property. It runs **every minute**
rather than nightly, because it is a latency mechanism, not a batch: it POSTs
`{"driveAll": true}` to `learn-ingest`, which advances every `ingest_jobs` row whose `heartbeat_at`
is older than five minutes by exactly ONE step (at most 20 jobs per tick) and returns. A job that is
actively progressing has a fresh heartbeat and is not touched. **It spends real money at a paid API,
which is why the Vault gate matters at least as much here as it did for the nightly job** — a local
reset that silently started ingesting every seeded source would bill for it.

**Correction to an earlier note in this doc:** an earlier version of this section said `pg_cron`/
`pg_net` "are not present in the local stack." That was never actually verified against this
project's local stack and turned out to be wrong — **both extensions work locally, and jobs really
fire.** Confirmed live: `create extension if not exists pg_cron` succeeds, `cron.schedule(...)`
registers a real job, `net.http_post` from inside the `db` container reaches the local Edge Runtime
at `http://kong:8000/functions/v1/<name>` (the `db` and `kong`/edge-runtime containers share
`supabase_network_college-app`; `127.0.0.1:54321` only works from the *host*, not from inside another
container — use the `kong` service name for any URL a migration or cron job constructs), and
`cron.job_run_details` shows `status = 'succeeded'` with a real `agent_reports` row landing afterward.
Proven for both `nightly-analysis` and the exact SQL the migration registers (not a simplified stand-in).

**Why the migration still gates registration behind a Vault secret, even though pg_cron works locally:**
a plain `create extension`-availability guard would leave every fresh `npm run db:reset` scheduling
real jobs against the seeded local stack — including `demo@collegeos.app`, whose entire value is its
stable, curated, screenshot-worthy semester data. So the actual gate the migration checks is narrower
and more deliberate: **do the `cron_shared_secret` / `edge_functions_base_url` / `edge_functions_anon_key`
Vault secrets already exist?** Nothing sets them by default (not in seed.sql, not automatically), so a
fresh local reset registers zero jobs — confirmed: `select count(*) from cron.job;` → `0` right after
`npm run db:reset`. An operator opts in explicitly:

```sql
-- Run once, after deploying this migration, in the Studio SQL editor (or via a one-off
-- migration if this is meant to be permanent from day one — never commit the real values
-- to a checked-in migration file):
select vault.create_secret('<a random 32+ byte value>', 'cron_shared_secret');
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1', 'edge_functions_base_url');
select vault.create_secret('<the project anon key>', 'edge_functions_anon_key');
```

The `x-cron-secret` header value must match whatever `CRON_SHARED_SECRET` is set to as an Edge
Function secret (`supabase secrets set CRON_SHARED_SECRET=...`, §7 above) — they're the same value in
two different stores (Vault for the cron job to send, Edge Function secrets for the handler to check),
not one shared reference, since a cron job's SQL body and a Deno Edge Function don't share a secret store.

**Operationally important, discovered live:** the seeded demo account's hand-authored nightly report
fixture (`seed.sql`, anchored to `current_date - 1`) and the real nightly job's own date math
(`addDays(localDateFromInstant(now, tz), -1)`, i.e. also "yesterday" relative to *now*) land on the
**same** `(user_id, report_type, local_date)` key whenever the job actually runs for demo on the day
after a reset. `storeNightlyAgentReport`'s upsert-on-that-key then **overwrites the seed fixture row**
— not a bug in the upsert itself (re-running the real job for a real user on a real night is
*supposed* to replace that night's row, not duplicate it), but a real interaction between fixture
data and real generation that cost a `db:reset` to recover from during this verification. If demo's
nightly-report fixture is meant to stay hand-authored and stable, do not let the real
`nightly-analysis`/`weekly-synthesis` cron run against `demo@collegeos.app` in an environment where
that fixture matters — exclude demo from the all-users loop, or accept that the fixture becomes
real-generated content the first time the job runs.

**Timezone:** `pg_cron` schedules in UTC. `0 12 * * *` (nightly) / `0 12 * * 1` (weekly, Mondays) is
deliberately noon UTC — the latest point in the day by which literally every real-world UTC offset
(down to UTC-12) has already crossed its own local midnight for the target day, so the schedule never
needs one entry per timezone. `nightly-analysis`/`weekly-synthesis` compute each user's own last-
completed local day from their profile's `timezone` column internally
(`addDays(localDateFromInstant(now, tz), -1)`) — the UTC firing hour only has to be late enough that
every timezone has already had its midnight; it is not itself a per-user value. Verify after deploy
with `select jobid, jobname, schedule, active from cron.job;` and, after the first scheduled fire,
`select * from cron.job_run_details order by start_time desc limit 5;`.

---

## 9. Backups & recovery ⬜

- **Database → Backups** — confirm daily backups are on (Pro plan required for PITR).
- This database holds journals, grades, and behavioral records. Verify a restore works *before*
  relying on it.

---

## 10. Observability ⬜

- **Logs → Postgres / API / Auth / Edge Functions** — confirm all are reporting after first traffic.
- **Reports → Performance** — check for slow queries after a week of real use.
- **Advisors → Performance** — resolve missing-index and unindexed-foreign-key findings.

---

## 11. Post-deploy verification checklist ⬜

Run every item and record the result. Do not mark the deploy done until all pass.

- [ ] `supabase db diff --linked` reports no differences
- [ ] `supabase test db --linked` passes
- [ ] Every `public` table shows RLS enabled
- [ ] Security Advisor is clear
- [ ] Sign up with a real address → confirmation email arrives → confirm → land authenticated
- [ ] Sign out → sign in → session persists across reload
- [ ] Password reset end to end
- [ ] Mobile deep link returns to the app after email confirmation
- [ ] Create a second user; verify from the client that user A cannot read *any* of user B's rows
- [ ] Upload a syllabus; verify the object is not publicly reachable without a signed URL
- [ ] Nightly analysis function runs and writes a report
- [ ] LLM budget ceiling blocks a call when exceeded
- [ ] `llm_usage_log` records tokens and cost for every call
- [ ] Web app loads against cloud with no console errors
- [ ] Mobile app loads against cloud on a physical device

---

## 12. Rollback

```bash
supabase db dump --linked -f backup-$(date +%F).sql   # take this FIRST, every time
```

Migrations are forward-only. To revert, write a new compensating migration; never edit an applied
one — editing an applied migration desynchronizes the migration history and the next `db push` will
fail or, worse, silently diverge.
