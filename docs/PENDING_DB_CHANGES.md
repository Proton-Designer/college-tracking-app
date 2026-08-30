# Pending database changes — for the machine that has Supabase credentials

> ## ✅ FULLY APPLIED — nothing in this document is outstanding (2026-08-30)
>
> **Migration 47, the subject of this document, is applied.** So are 48–65, which this document
> was written before and never described. `supabase db push` ran against
> `jcikqbxwjmdduwprixpy` on 2026-08-30 and the remote migration history is now complete through
> 65.
>
> **Two claims below are wrong and are corrected here rather than edited out.** §0 says the last
> applied migration is 46 — it was **47**, already applied at some point before this build, which
> neither this file nor the connection checklist knew. And the pending list names 47 alone; the
> real pending set at push time was 48 through 65.
>
> Why the rest is left standing: a doc row is a claim about the past, and this one accurately
> records what its author believed on 2026-08-27. Its migration-47 write-up — the budget clamp,
> its failure modes, its verification SQL — is the only place that reasoning exists and is worth
> keeping. `docs/CONNECTION_CHECKLIST.md` §0 is the live apply sequence for a fresh project.

> **Read this before running anything.** Work done on 2026-08-27 produced schema and
> data-layer changes that **could not be applied or verified here**, because this machine
> has no Supabase credentials and no Docker. Every database-side item is written up below
> as an instruction rather than left as a migration file someone has to reverse-engineer.
>
> **Audience:** whoever holds the cloud project credentials (currently Kareem), or their
> agent. It assumes you have not seen the conversation that produced these changes.

---

## 0. State this document was written against

| Fact | Value |
|---|---|
| Branch | `fix/review-findings-and-parity` |
| Base commit | `40be9c3` (the 63-commit handover drop) |
| Highest migration **already applied** to cloud | `00000000000046_lecture_capture.sql` |
| Cloud project ref | `jcikqbxwjmdduwprixpy` |
| Migrations added by this work | see §2 |
| Applied here? | **No.** Nothing in §2 has touched any database. |

`npm run verify` passes on this branch without a database — it needs none. Everything
below is what verify *cannot* tell you.

---

## 1. How to apply, in order

Run from the repo root, on a machine that is linked to the cloud project.

```bash
# 1. Confirm you are linked to the right project before pushing anything.
supabase projects list          # the linked one is marked
supabase migration list         # shows local vs remote; 46 should be the last REMOTE one

# 2. Apply the new migrations.
supabase db push

# 3. Regenerate the typed client. Required whenever a migration changes a table,
#    column, constraint or enum — the generated file is committed, and a stale one
#    produces type errors that look like application bugs.
npm run db:types:cloud

# 4. Prove the tree still builds against the regenerated types.
npm run verify
```

If `supabase db push` refuses because remote history diverges from local, **stop** and
read §4 before forcing anything.

---

## 2. Migrations to apply

> Each block below is filled in by whoever authored the migration. If a block says
> `PENDING`, the migration file exists but its handover notes have not landed yet — do not
> apply it until they do.

### 47 — Upper clamp on `profiles.llm_monthly_budget_usd`

**File:** `supabase/migrations/00000000000047_llm_budget_upper_clamp.sql`
**Status:** written and reviewed here; **not applied to any database.**

**What it changes**
Drops and recreates the `profiles_budget_positive` CHECK constraint on
`public.profiles.llm_monthly_budget_usd`. Old: `> 0`. New: `> 0 and <= 200`. It also
UPDATEs any existing row above 200 down to 200 **before** the constraint is added.

**Why it exists**
The pre-flight budget check in `_shared/llm/gateway.ts` is the *only* spend throttle in
the system — there is no rate limit behind it. That makes this column the actual brake on
how much one account can authorise against the shared Anthropic key, and before this
change it was `numeric(8,2)` with only a lower bound, so it accepted values up to
$999,999.99. The server action that writes it also performed no validation at all; a
server action is directly callable, so the client-side check was never a control.

**Keep two numbers in step.** `MAX_LLM_MONTHLY_BUDGET_USD` in
`apps/web/src/app/(app)/settings/actions.ts` is 200 and now rejects the same bound before
this column is ever written. If you change one, change the other in the same commit — a
constraint the app layer disagrees with becomes an opaque write failure on a value the UI
already accepted.

**Apply**
```bash
supabase db push        # or: supabase migration up
```
**No `npm run db:types:cloud` needed afterwards.** This changes a constraint only — no
column added, removed or renamed — so the generated types are unaffected.

**Failure modes**
The migration runs as a single transaction, so it is all-or-nothing. The existing-row
UPDATE runs first, which means no row can violate the new bound by the time the constraint
is added — that failure mode is designed out rather than merely unlikely. (This ordering
is not optional: Postgres validates existing data when adding a CHECK, so a single row
above 200 would fail the whole migration.)

The one real failure case is `profiles_budget_positive` not existing under that exact name
on the target project. It should — it was added in migration 3. If it has been renamed,
`drop constraint` fails with "constraint does not exist" and the migration aborts cleanly
with nothing half-applied.

**Verify it applied**
```sql
-- Expect the two-sided expression.
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conname = 'profiles_budget_positive';
-- CHECK (((llm_monthly_budget_usd > (0)::numeric) AND (llm_monthly_budget_usd <= (200)::numeric)))

-- Expect 0.
select count(*) from public.profiles where llm_monthly_budget_usd > 200;
```

**Idempotent?** The clamp UPDATE is (re-clamping is a no-op). The constraint drop+add is
not safely re-runnable as raw SQL outside Supabase's migration history — a second raw run
fails at `drop constraint`, which is harmless but stops there. `supabase db push` will not
re-apply an already-recorded migration.

### No migration 48

A partial unique index on `deliverables(user_id, course_id, title)` was considered as a
second line of defence against duplicate inserts and **deliberately rejected**. The
duplicate-insert race is fully closed in application code by the claim-before-write CAS
guard (see the confirm pipelines), and a hard uniqueness constraint would reject
legitimate data: the same deliverable title recurring across terms, or after a course is
re-added. A constraint that has to be worked around is worse than no constraint.

**47 is the only migration on this branch.**

---

## 3. Verification debt this work did NOT clear

These are pre-existing and unchanged. They are listed here because §1 is the moment
someone finally has a database in front of them, and this is the cheapest time to close
them.

| Owed | Why it is still owed | Command |
|---|---|---|
| **pgTAP for migrations 34–46** | Needs Docker; the machine that wrote them had none. ~17 tables added with RLS verified only by live anon probes and role simulation — weaker than executing the policies. This is the single largest verification gap in the project. | `npm run db:reset && npm run db:test` |
| **E2E suite (28 specs)** | Local-stack-only by design; has not run since the original handoff. | `npm run test:e2e` |
| **API integration suite (101)** | Same. Note decision D14: these must be run **twice** — green once is not green. | `npm run test:integration` |
| **Deno live-DB suites** | Same. | see `HANDOFF.md` §3.5 |

A four-verb RLS grid was read off the migration source for tables 34–46 and every table
carried `enable` + `force` RLS with `for all` policies scoped to
`(select auth.uid()) = user_id`, both `using` and `with check`. That is good evidence, but
it is *reading* SQL rather than *executing* it, and the bug that shipped as migration 40
was a missing verb on a table that already had RLS enabled. pgTAP is what actually closes
this.

---

## 4. If `supabase db push` reports diverged history

Do not reach for `--include-all` or any force flag as a first move. Diverged history
usually means one of:

- A migration was applied directly through the Supabase dashboard SQL editor and never
  written to `supabase/migrations/`. Fix by writing the equivalent migration file locally
  so the two agree, then repairing the history table.
- `supabase migration repair` is needed to mark a specific version applied or reverted.
  Run `supabase migration list` first and reconcile the two columns by eye before
  repairing anything.

Forcing a push against a project that holds the only copy of real user data is not
recoverable. If the two lists disagree in a way that is not obvious, stop and ask rather
than pushing.

---

## 5. Things that are NOT database changes

Recorded here only so nobody goes looking for a migration that does not exist:

- **Timezone fixes** (`packages/api/src/day/risk.ts`, `academic/backplan.ts`,
  `day/killLoopBounceBack.ts`, and the two Deno mirrors in
  `supabase/functions/_shared/nightly/`) are pure application code. Three inherited sites
  derived a *local* day from a UTC ISO slice. No schema involved, nothing to apply.
- **The LLM budget server-side validation** is application code; only its CHECK constraint
  counterpart (§2, migration 47) is a database change.
- **Edge-function changes** deploy separately from migrations —
  `supabase functions deploy <name>`. They are not covered by `db push`. Any function
  changed by this work still needs deploying, and per `HANDOFF.md` §3.2 the CLI needs the
  `import_map` entries in `config.toml` (CLI ≥ 2.115) for that to succeed.
