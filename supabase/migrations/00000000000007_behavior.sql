-- Behavior cluster: the Kill Loop, friction logging, commitment escalation, decision
-- journal, and freeform journal entries.

-- Shared by every table below whose local_date is derived from an `occurred_at` instant
-- (as opposed to deliverables.due_at, which has its own sync function since the source
-- column is named differently).
create or replace function public.sync_local_date_from_occurred_at()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tz text;
begin
  select timezone into tz from public.profiles where id = new.user_id;
  new.local_date := public.local_date(new.occurred_at, coalesce(tz, 'UTC'));
  return new;
end;
$$;

-- ============================================================================
-- kill_habits / kill_events / commitment_escalation_events
-- ============================================================================
create table public.kill_habits (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  trigger_description text,
  urge_description text,
  immediate_reward text,
  long_term_cost text,
  replacement_behavior text,
  implementation_intention text,
  escalation_level public.commitment_level not null default 'l0_reminder',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index kill_habits_user_id_idx on public.kill_habits (user_id);

create trigger kill_habits_set_updated_at
  before update on public.kill_habits
  for each row execute function public.set_updated_at();

alter table public.kill_habits enable row level security;
alter table public.kill_habits force row level security;

create policy kill_habits_all_own on public.kill_habits
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.kill_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kill_habit_id bigint not null references public.kill_habits (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  local_date date not null,
  trigger_context text,
  mood_before smallint check (mood_before between 1 and 10),
  -- Auto-detected later from screen telemetry where possible; null until then.
  duration_min integer check (duration_min is null or duration_min >= 0),
  outcome text not null check (outcome in ('relapsed', 'resisted')),
  created_at timestamptz not null default now()
);

create index kill_events_user_id_idx on public.kill_events (user_id);
create index kill_events_kill_habit_id_idx on public.kill_events (kill_habit_id);
create index kill_events_local_date_idx on public.kill_events (user_id, local_date);

create trigger kill_events_sync_local_date
  before insert or update of occurred_at, user_id on public.kill_events
  for each row execute function public.sync_local_date_from_occurred_at();

alter table public.kill_events enable row level security;
alter table public.kill_events force row level security;

create policy kill_events_all_own on public.kill_events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- History of escalation-ladder changes (L0-L4). kill_habits.escalation_level is the
-- current state; this table is the audit trail of how it got there.
create table public.commitment_escalation_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kill_habit_id bigint not null references public.kill_habits (id) on delete cascade,
  from_level public.commitment_level not null,
  to_level public.commitment_level not null,
  reason text,
  occurred_at timestamptz not null default now()
);

create index commitment_escalation_events_user_id_idx
  on public.commitment_escalation_events (user_id);
create index commitment_escalation_events_kill_habit_id_idx
  on public.commitment_escalation_events (kill_habit_id);

alter table public.commitment_escalation_events enable row level security;
alter table public.commitment_escalation_events force row level security;

create policy commitment_escalation_events_all_own on public.commitment_escalation_events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- friction_logs: "a database of why the user fails" -- pure event log, aggregated by
-- packages/core §9. cause_detail carries the free-text answer when cause = 'other',
-- classified later by the Haiku friction-classification call (docs/LLM_LAYER_SPEC.md #8).
-- ============================================================================
create table public.friction_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  local_date date not null,
  related_task_id bigint references public.tasks (id) on delete set null,
  cause public.friction_cause not null,
  cause_detail text,
  created_at timestamptz not null default now()
);

create index friction_logs_user_id_idx on public.friction_logs (user_id);
create index friction_logs_local_date_idx on public.friction_logs (user_id, local_date);
create index friction_logs_related_task_id_idx on public.friction_logs (related_task_id);

create trigger friction_logs_sync_local_date
  before insert or update of occurred_at, user_id on public.friction_logs
  for each row execute function public.sync_local_date_from_occurred_at();

alter table public.friction_logs enable row level security;
alter table public.friction_logs force row level security;

create policy friction_logs_all_own on public.friction_logs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- decision_journal: predictions on important choices, scored later.
-- ============================================================================
create table public.decision_journal (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  local_date date not null,
  decision text not null,
  rationale text,
  prediction_pct numeric(5, 2) check (prediction_pct between 0 and 100),
  predicted_outcome text,
  actual_outcome text,
  scored_at timestamptz,
  created_at timestamptz not null default now()
);

create index decision_journal_user_id_idx on public.decision_journal (user_id);
create index decision_journal_local_date_idx on public.decision_journal (user_id, local_date);

create trigger decision_journal_sync_local_date
  before insert or update of occurred_at, user_id on public.decision_journal
  for each row execute function public.sync_local_date_from_occurred_at();

alter table public.decision_journal enable row level security;
alter table public.decision_journal force row level security;

create policy decision_journal_all_own on public.decision_journal
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- journal_entries: freeform reflection. The most sensitive text in the schema (see
-- docs/LLM_LAYER_SPEC.md §7) -- never logged, never sent beyond the nightly/coach calls.
-- Soft-delete only (constraint #9): a user purging a journal entry should still let the
-- row exist long enough for derived-summary invalidation, per LLM_LAYER_SPEC's purge rule.
-- ============================================================================
create table public.journal_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  entry_type text not null check (entry_type in ('morning', 'night', 'freeform')),
  content text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index journal_entries_user_id_idx on public.journal_entries (user_id);
create index journal_entries_local_date_idx on public.journal_entries (user_id, local_date);

alter table public.journal_entries enable row level security;
alter table public.journal_entries force row level security;

create policy journal_entries_all_own on public.journal_entries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
