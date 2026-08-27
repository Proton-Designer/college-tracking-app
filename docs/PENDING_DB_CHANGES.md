# Pending database changes — for the machine that has Supabase credentials

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

**Status:** PENDING — authored, handover block to be appended before this doc is final.

**What it changes**
Replaces the existing `profiles_budget_positive` CHECK constraint with one carrying both a
lower and an upper bound: `llm_monthly_budget_usd > 0 and llm_monthly_budget_usd <= 200`.

**Why it exists**
The pre-flight budget check in the edge-function LLM gateway is the *only* spend throttle
in the system — there is no rate limit behind it. That makes this column the brake. Before
this change the column was `numeric(8,2)` with only a `> 0` check, so it accepted values up
to $999,999.99, and the server action that writes it performed no validation at all (a
server action is directly callable, so the client-side check was never a control). The
application-layer half of this fix is already committed in
`apps/web/src/app/(app)/settings/actions.ts` as `MAX_LLM_MONTHLY_BUDGET_USD = 200`.

**Keep the two numbers in step.** If you change the constraint bound, change that constant
in the same commit, or the app will accept a value the database rejects and surface it to
the user as an opaque write failure.

**What could make it fail to apply**
Any existing `profiles` row with `llm_monthly_budget_usd > 200`. The migration is expected
to clamp such rows defensively in the same transaction — confirm it does before running.
The default is `5.00` and this is currently a single-user project, so in practice there
should be nothing to clamp, but do not assume it.

**How to verify it applied**

```sql
-- Expect: one row, with the new two-sided expression in the definition.
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.profiles'::regclass
  and contype = 'c'
  and conname like '%budget%';

-- Expect: ERROR (new row violates check constraint). If this SUCCEEDS the clamp is not live.
update public.profiles set llm_monthly_budget_usd = 50000;
```

Roll the second one back — run it inside `begin; … rollback;` so a successful-by-mistake
update does not persist.

**Idempotent?** Re-running `supabase db push` is safe; it will not re-apply an applied
migration. The migration body itself should not be executed twice by hand.

### 48 — Partial unique index on `deliverables` *(may not exist)*

**Status:** CONDITIONAL — only exists if the confirm-pipeline work concluded it was
warranted. If there is no `00000000000048_*.sql` file, ignore this section entirely.

**Context if it does exist:** the staging→confirm pipelines had a check-then-act race —
read `status`, several awaited round trips, then a bare status update with no
compare-and-swap. Two concurrent confirms could both pass the check and both insert. The
primary fix is a compare-and-swap in application code (already done, no schema needed).
A unique index on `deliverables(user_id, course_id, title)` was considered as a second
line of defence.

**If it exists, before applying it:** check for pre-existing duplicates, because the index
creation will fail on them and the failure message will not tell you which rows.

```sql
select user_id, course_id, title, count(*)
from public.deliverables
group by 1, 2, 3
having count(*) > 1;
```

Resolve any rows this returns *before* pushing.

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
