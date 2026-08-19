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

All are private and read through signed URLs. Storage RLS policies restrict every object to a path
prefixed with the owner's user id. Verify under **Storage → Policies** that no bucket is public —
syllabi and proof attachments are personal academic records.

---

## 7. Edge Functions & secrets ⬜

Set secrets **before** deploying, or the first invocation will fail:

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set LLM_MONTHLY_BUDGET_USD=10
supabase secrets set CRON_SHARED_SECRET="$(openssl rand -hex 32)"
supabase secrets list
```

Deploy:

```bash
supabase functions deploy --no-verify-jwt=false
supabase functions list
```

> `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are injected into Edge
> Functions automatically. Do not set them manually.

*(Function inventory populated in L7 / L10.)*

---

## 8. Scheduled jobs ⬜

*(Populated in L7.)* Nightly analysis and weekly synthesis run via `pg_cron` calling an Edge
Function through `pg_net`.

Because `pg_cron`/`pg_net` are not present in the local stack, these jobs are exercised locally by
invoking the function directly. The cron registration SQL therefore lives in a migration guarded to
be a no-op when the extensions are unavailable.

**Timezone caution:** `pg_cron` schedules in UTC. The nightly job must fire after the *user's* local
midnight, so the schedule is computed from the user's stored timezone rather than hardcoded. Verify
after deploy with `select * from cron.job;`.

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
