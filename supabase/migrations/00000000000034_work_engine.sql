-- Phase 1 of docs/BLUEPRINT_PLAN.md: the Work Engine spine -- the Deep Work Hour, the
-- distraction causes behind the counter, and the day-level facts (wake, sleep intent,
-- baseline) that Delta and Day Won are computed from.
--
-- Ruling C1 (docs/BLUEPRINT_RECONCILIATION.md): the Hour EXTENDS task_sessions rather
-- than getting its own work_hours table. task_sessions already carries the expensive
-- parts -- resumability from actual_start by wall clock, one-active-per-user enforced by
-- a partial unique index (migration 12), and the active/completed/abandoned distinction
-- the duration-calibration engine depends on. A parallel table would duplicate all of it
-- and give the calibration engine two places to read from, which is the "two sources of
-- truth" failure check:core-mirror exists to prevent elsewhere.
--
-- Ruling D23 (.brain/memory/decisions.md): there is NO chain. No consecutive-day counter,
-- no repair tokens, no chain_repair_used column. Recovery is bounce-back
-- (packages/core/src/bounceback), which already means time-to-recovery and already
-- exists. Day Won survives as a per-day binary; it is not a streak.

-- ============================================================================
-- 1. Distraction causes
-- ============================================================================

-- ENUM rather than text + CHECK, per the enum policy in migration 0002: this is a closed
-- set we control, it mirrors a packages/core TypeScript union, and it is not expected to
-- churn -- the six causes come from the source material's taxonomy, the same reasoning
-- that made commitment_level an enum. Contrast task_sessions.category below, which is
-- deliberately open-ended text.
create type public.distraction_cause as enum (
  'phone',
  'got_hard',
  'finished_early',
  'notification',
  'reflex',
  'bored'
);

-- ============================================================================
-- 2. task_sessions becomes able to represent an Hour
-- ============================================================================

alter table public.task_sessions
  -- Which Hour of the local day this is (1, 2, 3...). NULL means "an ordinary task
  -- session, not a logged Hour" -- every row that predates this migration is exactly
  -- that, and must not be back-dated into a day's Hour count.
  add column hour_index smallint check (hour_index is null or hour_index > 0),
  -- The one specific thing this Hour produces. Free text and separate from tasks.title
  -- on purpose: an Hour can exist without a task row (see task_id below), and the
  -- deliverable is a statement about THIS hour, not about a durable to-do item.
  add column deliverable text,
  -- School / MyHomeBase / Content / Systems / Admin ... Text with no FK, for the same
  -- reason tasks.category is: the set a user accumulates is personal and open-ended, and
  -- the blueprint calls it an editable list.
  add column category text,
  -- Computed at write time from actual_start (falling back to planned_start) + the
  -- user's timezone, never recomputed on read -- same rule and same reason as
  -- deliverables.local_due_date. Day boundaries are ALWAYS local. This column is what
  -- makes "how many Hours today" answerable without a join or a timezone conversion at
  -- read time, which is precisely where B4 got in last time.
  add column local_date date;

-- An Hour is not tied to a task. "Start Hour" takes a one-line deliverable and arms the
-- timer; requiring a tasks row first would put a second write in front of the product's
-- hottest path, and the blueprint's failure-mode walkthrough explicitly budgets five
-- seconds of friction there, not a task-creation flow.
alter table public.task_sessions
  alter column task_id drop not null;

comment on column public.task_sessions.hour_index is
  'Which Hour of the local day this row is (1-based). NULL means this is an ordinary '
  'task session, not a logged Deep Work Hour -- rows predating migration 34 are all NULL '
  'and must never count toward a day''s Hours.';

comment on column public.task_sessions.task_id is
  'Nullable since migration 34: an Hour may be started from a one-line deliverable with '
  'no task row behind it.';

create index task_sessions_user_local_date_idx
  on public.task_sessions (user_id, local_date);

create or replace function public.task_sessions_sync_local_date()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tz text;
begin
  select timezone into tz from public.profiles where id = new.user_id;
  new.local_date := public.local_date(
    coalesce(new.actual_start, new.planned_start),
    coalesce(tz, 'UTC')
  );
  return new;
end;
$$;

create trigger task_sessions_sync_local_date
  before insert or update of actual_start, planned_start, user_id on public.task_sessions
  for each row execute function public.task_sessions_sync_local_date();

-- Backfill: existing rows get a local_date so day-scoped queries are total rather than
-- silently skipping history. hour_index stays NULL for all of them -- they are task
-- sessions, not Hours, and pretending otherwise would invent a work history that never
-- happened.
update public.task_sessions
  set local_date = public.local_date(
    coalesce(actual_start, planned_start),
    coalesce((select timezone from public.profiles p where p.id = task_sessions.user_id), 'UTC')
  )
  where local_date is null;

-- ============================================================================
-- 3. distractions -- the causes behind the counter (ruling C2)
-- ============================================================================

-- Additive by ruling: task_sessions.interruptions stays and stays authoritative for every
-- existing reader (frictionAnalytics among them). This table records WHY, which the
-- counter alone can never answer and which the distraction-Pareto surface needs.
create table public.distractions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  session_id bigint not null references public.task_sessions (id) on delete cascade,
  cause public.distraction_cause not null,
  -- When the tap happened, not when the row was written. The gap matters if a client ever
  -- queues taps offline, which Minimum Viable Mode implies it eventually will.
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index distractions_session_id_idx on public.distractions (session_id);
create index distractions_user_id_idx on public.distractions (user_id);

alter table public.distractions enable row level security;
alter table public.distractions force row level security;

create policy distractions_all_own on public.distractions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- The counter is kept in lockstep with the rows by the database, not by the client.
-- Two writes from application code would drift the moment one of them failed, and the
-- drift would be invisible -- an under-counted hour looks exactly like a focused one.
create or replace function public.distractions_sync_counter()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target bigint;
begin
  target := coalesce(new.session_id, old.session_id);
  update public.task_sessions
    set interruptions = (
      select count(*) from public.distractions d where d.session_id = target
    )
    where id = target;
  return null;
end;
$$;

create trigger distractions_sync_counter
  after insert or delete on public.distractions
  for each row execute function public.distractions_sync_counter();

comment on table public.distractions is
  'One row per +1 Distraction tap, with its cause. task_sessions.interruptions is kept '
  'equal to the count of these rows by trigger -- never write that column directly.';

-- ============================================================================
-- 4. days -- wake, sleep intent, and the day's baseline
-- ============================================================================

-- Only facts that cannot be derived are stored here. hours_completed, Day Won, Delta and
-- the efficiency ratio are all computed in packages/core from task_sessions + these
-- columns, so there is no second copy to drift: the same rule daily_checkins states about
-- its own capacity snapshot ("not the live source of truth").
create table public.days (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The local calendar day. Supplied by the caller, which already computed it through
  -- packages/core's localDateFromInstant -- the one true instant-to-local-date conversion.
  local_date date not null,
  -- Set by "Start Day". Delta is measured from here to the first completed Hour, so a day
  -- with no wake_at reports delta as NULL (unknown), never 0 -- the same null-vs-zero rule
  -- tasks.planned_start_at states for start delay.
  wake_at timestamptz,
  -- Set by the Night Plan's close-out. Feeds sleep-consistency and, later, the caffeine
  -- cutoff.
  sleep_intent_at timestamptz,
  -- Hours required for this day to be Won. Default 4 is the source material's stated
  -- baseline, not an invented constant; per-weekday baselines are Phase 3, and until then
  -- a day can still be overridden individually.
  baseline_hours smallint not null default 4 check (baseline_hours >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date),
  constraint days_sleep_after_wake
    check (sleep_intent_at is null or wake_at is null or sleep_intent_at > wake_at)
);

create index days_user_local_date_idx on public.days (user_id, local_date);

create trigger days_set_updated_at
  before update on public.days
  for each row execute function public.set_updated_at();

alter table public.days enable row level security;
alter table public.days force row level security;

create policy days_all_own on public.days
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.days is
  'Day-level facts that cannot be derived: wake time, sleep intent, and the day''s Hour '
  'baseline. Hours completed, Day Won, Delta and efficiency are computed in '
  'packages/core, never stored here. There is deliberately no chain or streak column -- '
  'see D23 in .brain/memory/decisions.md.';
