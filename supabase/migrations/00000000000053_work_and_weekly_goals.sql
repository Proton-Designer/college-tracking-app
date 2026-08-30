-- The Work domain, plus the weekly-goal cadence that Business and Deen both read.
--
-- Ported from LifeOS (directive rule 3.4), authored fresh per D42. His naming is `co_op`
-- throughout; it is `work` here, matching the domain enum from migration 48 -- one word for one
-- concept across the schema, rather than a synonym that every future reader has to learn.

-- ============================================================================
-- 1. Work targets -- the pipeline
-- ============================================================================

create type public.work_target_status as enum ('active', 'blocked', 'done', 'dropped');

create table public.work_targets (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  status public.work_target_status not null default 'active',
  deadline date,
  sort_order smallint not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_targets_title_not_blank check (btrim(title) <> ''),
  -- A completion timestamp and a non-done status contradict each other; the constraint makes the
  -- contradiction unrepresentable rather than something a reader has to notice.
  constraint work_targets_completed_matches_status
    check ((status = 'done') = (completed_at is not null))
);

create index work_targets_user_status_idx on public.work_targets (user_id, status, sort_order);

create trigger work_targets_set_updated_at
  before update on public.work_targets
  for each row execute function public.set_updated_at();

alter table public.work_targets enable row level security;
alter table public.work_targets force row level security;

create policy work_targets_all_own on public.work_targets
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.work_target_tasks (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  target_id bigint not null references public.work_targets (id) on delete cascade,
  title text not null,
  status public.work_target_status not null default 'active',
  deadline date,
  -- What this is waiting on, in the user's own words. LifeOS models blocking as free text rather
  -- than a dependency graph, and that is the right call for a personal pipeline: the useful fact is
  -- "waiting on the manager to reply", which no FK can hold.
  blocked_reason text,
  sort_order smallint not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_target_tasks_title_not_blank check (btrim(title) <> ''),
  constraint work_target_tasks_completed_matches_status
    check ((status = 'done') = (completed_at is not null))
);

create index work_target_tasks_target_idx on public.work_target_tasks (target_id, sort_order);

create trigger work_target_tasks_set_updated_at
  before update on public.work_target_tasks
  for each row execute function public.set_updated_at();

alter table public.work_target_tasks enable row level security;
alter table public.work_target_tasks force row level security;

create policy work_target_tasks_all_own on public.work_target_tasks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- 2. Shifts
-- ============================================================================

-- Recurring by ISO weekday (1=Mon..7=Sun, the schema's one weekday convention) with an optional
-- specific date for a one-off. Both shapes in one table because the read is always "what am I
-- working this week", and splitting them would mean unioning two tables for every render.
create table public.work_shifts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  weekday smallint check (weekday is null or weekday between 1 and 7),
  local_date date,
  start_time time not null,
  end_time time not null,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Exactly one of the two shapes. A row that is both recurring and dated has no defined meaning,
  -- and a row that is neither cannot be placed on a calendar at all.
  constraint work_shifts_recurring_xor_dated
    check ((weekday is null) <> (local_date is null))
);

create index work_shifts_user_idx on public.work_shifts (user_id, weekday, local_date);

create trigger work_shifts_set_updated_at
  before update on public.work_shifts
  for each row execute function public.set_updated_at();

alter table public.work_shifts enable row level security;
alter table public.work_shifts force row level security;

create policy work_shifts_all_own on public.work_shifts
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- 3. Weekly goals -- the cadence (D37)
-- ============================================================================

-- D37 ruled that LifeOS's weekly headline and our War Map both survive, linked, because they answer
-- different questions: `goals`/`milestones` is the STORE OF DIRECTION (top-5, monthly), and this is
-- the CADENCE (per-domain, week-scoped). Neither absorbs the other.
--
-- `goal_id` is the link and is nullable on purpose: a week's focus usually should step down from a
-- War Map milestone, but forcing it would make the weekly surface unusable for the weeks when
-- something urgent and unplanned is the honest answer.
create table public.weekly_goals (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The week's first day, from packages/core's startOfWeek -- which returns the SUNDAY on or
  -- before the date, matching Deen's Qur'an week and every Sun-Sat strip in the app.
  week_start_date date not null,
  domain public.life_domain not null,
  headline text not null,
  -- One milestone per line, exactly as LifeOS models it. Free text rather than rows: these are
  -- written and rewritten as a block in one textarea, and never queried individually.
  milestones text,
  goal_id bigint references public.goals (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_goals_headline_not_blank check (btrim(headline) <> ''),
  -- One headline per domain per week. More than one is not a focus.
  constraint weekly_goals_one_per_domain_week unique (user_id, week_start_date, domain)
);

create index weekly_goals_user_week_idx on public.weekly_goals (user_id, week_start_date desc);

create trigger weekly_goals_set_updated_at
  before update on public.weekly_goals
  for each row execute function public.set_updated_at();

alter table public.weekly_goals enable row level security;
alter table public.weekly_goals force row level security;

create policy weekly_goals_all_own on public.weekly_goals
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.weekly_goals is
  'The weekly focus, per domain (D37). The cadence layer; goals/milestones remains the store of '
  'direction. goal_id links a week to the milestone it steps down from and is nullable because '
  'some weeks are honestly about something unplanned.';

-- ============================================================================
-- 4. Distraction triggers and their action plans (M5)
-- ============================================================================

-- M5: our per-Hour six-cause distraction chips stay exactly as they are. This is the GLOBAL layer
-- from LifeOS that sits beside them -- named triggers a person recognises in themselves, and a
-- versioned plan for what to do about one.
create table public.distraction_triggers (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  domain public.life_domain,
  description text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint distraction_triggers_name_not_blank check (btrim(name) <> '')
);

create index distraction_triggers_user_idx on public.distraction_triggers (user_id, archived);

create trigger distraction_triggers_set_updated_at
  before update on public.distraction_triggers
  for each row execute function public.set_updated_at();

alter table public.distraction_triggers enable row level security;
alter table public.distraction_triggers force row level security;

create policy distraction_triggers_all_own on public.distraction_triggers
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Superseded rather than edited, which is LifeOS's design and worth keeping: the history of what
-- you have already tried against a trigger is the most useful thing about the feature, and an
-- in-place edit destroys it. Same instinct as the append-only attempts log.
create table public.trigger_action_plans (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  trigger_id bigint not null references public.distraction_triggers (id) on delete cascade,
  body text not null,
  version smallint not null default 1,
  superseded_at timestamptz,
  supersede_reason text,
  created_at timestamptz not null default now(),
  constraint trigger_action_plans_body_not_blank check (btrim(body) <> '')
);

-- At most one live plan per trigger. The partial index is what makes "the current plan" a fact
-- rather than a convention.
create unique index trigger_action_plans_one_live_per_trigger
  on public.trigger_action_plans (trigger_id)
  where superseded_at is null;

alter table public.trigger_action_plans enable row level security;
alter table public.trigger_action_plans force row level security;

create policy trigger_action_plans_all_own on public.trigger_action_plans
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.trigger_plan_outcomes (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_id bigint not null references public.trigger_action_plans (id) on delete cascade,
  local_date date not null,
  -- Did you follow the plan. Null is a legitimate third answer -- "did not review" is not "did not
  -- follow", and collapsing them would let silence read as failure.
  followed boolean,
  created_at timestamptz not null default now(),
  constraint trigger_plan_outcomes_one_per_day unique (user_id, plan_id, local_date)
);

create index trigger_plan_outcomes_plan_idx on public.trigger_plan_outcomes (plan_id, local_date desc);

alter table public.trigger_plan_outcomes enable row level security;
alter table public.trigger_plan_outcomes force row level security;

create policy trigger_plan_outcomes_all_own on public.trigger_plan_outcomes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
