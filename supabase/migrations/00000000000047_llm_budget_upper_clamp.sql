-- Upper clamp on profiles.llm_monthly_budget_usd (code-review finding, 2026-08-27).
--
-- profiles_budget_positive (migration 3) only ever checked `> 0` -- there was no
-- maximum. The gateway's pre-flight budget check (_shared/llm/gateway.ts) is the ONLY
-- spend throttle anywhere in this system; there is no rate limit behind it. That makes
-- this column the actual brake on how much a single account can authorise against the
-- shared Anthropic key, and a column with a floor but no ceiling is not a brake.
--
-- 200 (USD/month): matches MAX_LLM_MONTHLY_BUDGET_USD in
-- apps/web/src/app/(app)/settings/actions.ts, which now rejects the same bound
-- server-side before this column is ever written -- both layers must agree, since a
-- constraint the app layer disagrees with just becomes a confusing 500 for a value the
-- UI already accepted. $200 sits far above real single-user usage against the $5
-- default (see the code-review finding's own worked estimate: sustained abuse at the
-- default ceiling runs a few cents to low tens of dollars per hour) while still
-- stopping a fat-fingered or malicious 50000 from authorising five figures a month.
--
-- Existing rows above 200 are clamped down BEFORE the constraint is added, in the same
-- migration -- adding a CHECK constraint that any existing row violates fails the
-- migration outright (Postgres validates existing data by default), so this must not
-- be skipped even though no such row is expected in practice.
update public.profiles
  set llm_monthly_budget_usd = 200.00
  where llm_monthly_budget_usd > 200;

alter table public.profiles drop constraint profiles_budget_positive;
alter table public.profiles add constraint profiles_budget_positive
  check (llm_monthly_budget_usd > 0 and llm_monthly_budget_usd <= 200);
