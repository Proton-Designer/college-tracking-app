-- Voyage embedding spend joins the one cost ledger — D41's activation, made honest.
--
-- THE PROBLEM. `llm_usage_log` is not merely a report; it is the ledger the budget gate
-- sums (`getMonthlySpendUsd` in _shared/llm/budget.ts adds up *every* row for the user
-- this calendar month, then callLlm refuses the call that would cross
-- `profiles.llm_monthly_budget_usd`). The Learn ingestion pipeline introduces a SECOND
-- paying vendor. Voyage spend that billed outside this table would mean a monthly
-- ceiling that no longer means "everything this user costs" — and it would fail in the
-- quietest possible direction: the number on the screen stays under budget while the
-- real invoice does not. So Voyage rows go in this table, not a new one.
--
-- THE SMALLEST HONEST CHANGE. The table already stores `call_type` and `model` as plain
-- `text` (no enums), so `model = 'voyage-3.5-lite'` and
-- `call_type = 'lesson_embedding'` need no schema change at all, and the token columns
-- fit as they are — an embedding call has input tokens and no output tokens, so
-- `output_tokens = 0` is a true statement rather than a placeholder. Every other column
-- (`cost_usd`, `latency_ms`, `success`, `content_hash`) already means the right thing.
--
-- What is genuinely MISSING is the vendor. One column, `provider`:
--
--   * `model` technically identifies the vendor, but only to a reader who already knows
--     every model name this project has ever used. No query, no dashboard and no future
--     engineer does. "How much of last month was embeddings?" must not require a
--     hand-maintained `model in (...)` list that goes stale the first time a model name
--     changes.
--   * `default 'anthropic'` is not a convenience default — it is a true statement about
--     every row that exists today. There is no backfill to write and no window in which
--     a row means something ambiguous.
--   * NOT an enum, deliberately: `call_type` and `model` beside it are `text`, and a
--     third vendor should be a code change, not a migration. The check constraint below
--     is the guard instead — it rejects a typo without requiring `alter type` to add a
--     vendor.
--
-- REJECTED: a separate `embeddings_usage_log`. The budget gate would then have to sum
-- two tables, and the day someone adds a third vendor and forgets the third sum is the
-- day the ceiling silently stops enforcing. One ledger, one sum, one place to look.
--
-- REJECTED: reusing `model` alone with no provider column. See above — it works right up
-- until anyone has to query it.

alter table public.llm_usage_log
  add column provider text not null default 'anthropic'
    constraint llm_usage_log_provider_known check (provider in ('anthropic', 'voyage'));

comment on column public.llm_usage_log.provider is
  'Which vendor billed this row. The budget gate sums cost_usd across this whole table, '
  'so every paying vendor must write here rather than to its own ledger. '
  'default ''anthropic'' is a true statement about every row written before migration 55.';

-- Serves "what did embeddings cost this month" without scanning the user's whole
-- history. Deliberately (user_id, provider, created_at) and not (provider, created_at):
-- D39 makes this a three-person app and every cost question is per-user first.
create index llm_usage_log_user_provider_month_idx
  on public.llm_usage_log (user_id, provider, created_at);
