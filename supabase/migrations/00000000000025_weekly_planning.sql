-- Weekly planning -- the brief's Sunday planning session. Same category as
-- deliverable_backplans/backplan_milestones (docs/DATA_MODEL.md §3): a live, mutable
-- plan the user interacts with, gets REPLACED (not accumulated) when regenerated, and is
-- never treated as an append-only historical snapshot the way risk_snapshots/
-- grade_snapshots are. Do not add an UPDATE-denying policy to these two tables -- same
-- warning §3 already gives for backplans, for the same reason: "you adjust once, the
-- engine carries the plan forward" requires a plain UPDATE on a block to work.

create table public.weekly_plans (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start_date date not null,
  generated_at timestamptz not null default now(),
  academic_load text not null check (academic_load in ('low', 'moderate', 'high', 'critical')),
  total_needed_minutes integer not null check (total_needed_minutes >= 0),
  total_capacity_minutes integer not null check (total_capacity_minutes >= 0),
  has_unplaced_work boolean not null default false,
  unique (user_id, week_start_date)
);

create index weekly_plans_user_id_idx on public.weekly_plans (user_id);

alter table public.weekly_plans enable row level security;
alter table public.weekly_plans force row level security;

create policy weekly_plans_all_own on public.weekly_plans
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- weekly_plan_blocks: the actual suggested/adjusted focus blocks. status carries the
-- "you adjust once" interaction -- editing a block's status/time is a plain UPDATE on
-- this table and never regenerates the parent plan.
-- ============================================================================
create table public.weekly_plan_blocks (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  weekly_plan_id bigint not null references public.weekly_plans (id) on delete cascade,
  deliverable_id bigint references public.deliverables (id) on delete set null,
  course_id bigint references public.courses (id) on delete set null,
  block_date date not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  minutes integer not null check (minutes > 0),
  status text not null default 'suggested'
    check (status in ('suggested', 'confirmed', 'skipped', 'completed')),
  constraint weekly_plan_blocks_time_order check (end_at > start_at)
);

create index weekly_plan_blocks_user_id_idx on public.weekly_plan_blocks (user_id);
create index weekly_plan_blocks_plan_id_idx on public.weekly_plan_blocks (weekly_plan_id);
create index weekly_plan_blocks_date_idx on public.weekly_plan_blocks (user_id, block_date);

alter table public.weekly_plan_blocks enable row level security;
alter table public.weekly_plan_blocks force row level security;

create policy weekly_plan_blocks_all_own on public.weekly_plan_blocks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- weekly_plan_unplaced: the plan's honest "this didn't fit" disclosure -- mirrors
-- deliverable_backplans.dropped_phases/shortfall_minutes in spirit, but per-deliverable
-- rather than per-phase, and its own child rows rather than columns on the parent, since
-- a week can have several unplaced deliverables at once (a single backplan only ever has
-- one shortfall figure for itself).
-- ============================================================================
create table public.weekly_plan_unplaced (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  weekly_plan_id bigint not null references public.weekly_plans (id) on delete cascade,
  deliverable_id bigint references public.deliverables (id) on delete set null,
  course_id bigint references public.courses (id) on delete set null,
  minutes_needed integer not null check (minutes_needed >= 0),
  minutes_placed integer not null check (minutes_placed >= 0),
  minutes_shortfall integer not null check (minutes_shortfall >= 0),
  reason text not null check (reason in ('due_before_window', 'insufficient_capacity'))
);

create index weekly_plan_unplaced_user_id_idx on public.weekly_plan_unplaced (user_id);
create index weekly_plan_unplaced_plan_id_idx on public.weekly_plan_unplaced (weekly_plan_id);

alter table public.weekly_plan_unplaced enable row level security;
alter table public.weekly_plan_unplaced force row level security;

create policy weekly_plan_unplaced_all_own on public.weekly_plan_unplaced
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
