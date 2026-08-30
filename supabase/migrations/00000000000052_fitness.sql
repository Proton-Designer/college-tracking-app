-- The Fitness domain. Ported from LifeOS (directive rule 3.4), authored fresh per D42.
--
-- His schema carries two overlapping layers -- an older `workouts`/`workout_exercises` pair and a
-- newer `workout_plans`/`plan_sessions`/`plan_session_exercises` chain. Only the plan chain is
-- ported: carrying both would reproduce a two-sources-of-truth problem we would then have to
-- reconcile ourselves, which is exactly what C4 refused for due dates. If the older layer turns out
-- to hold data his app still needs, it arrives as its own migration with its own reason.
--
-- The split that matters here is PLAN vs PERFORMED, and it is the same plan/execute split C5 ruled
-- for study sessions: `plan_sessions` is what you intend to do, `workout_sessions` is what happened.
-- Collapsing them would make a missed workout indistinguishable from one that was never scheduled.

-- ============================================================================
-- 1. Exercises -- the movement library
-- ============================================================================

-- Muscle groups are a closed taxonomy from his volume model, where a movement credits its primary
-- mover 1 set and each secondary 0.5. Text arrays rather than a join table: a movement's muscles are
-- an attribute of the movement, never independently queried, and a join table here would add two
-- joins to every volume read for no gained fact.
create type public.muscle_group as enum (
  'chest',
  'back_lats',
  'back_mid',
  'front_delt',
  'side_delt',
  'rear_delt',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core'
);

create table public.exercises (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  primary_muscles public.muscle_group[] not null default '{}',
  secondary_muscles public.muscle_group[] not null default '{}',
  notes text,
  -- Retired rather than deleted: a logged set referencing a vanished exercise would corrupt every
  -- historical volume number. Same reasoning as questions.active.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exercises_name_not_blank check (btrim(name) <> ''),
  constraint exercises_name_unique_per_user unique (user_id, name)
);

create index exercises_user_active_idx on public.exercises (user_id, active);

create trigger exercises_set_updated_at
  before update on public.exercises
  for each row execute function public.set_updated_at();

alter table public.exercises enable row level security;
alter table public.exercises force row level security;

create policy exercises_all_own on public.exercises
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- 2. Plans -- what you intend to do
-- ============================================================================

create table public.workout_plans (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  description text,
  -- Exactly one active plan per user, enforced below. "Which plan am I on" must have one answer.
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_plans_name_not_blank check (btrim(name) <> '')
);

create unique index workout_plans_one_active_per_user
  on public.workout_plans (user_id)
  where active;

create trigger workout_plans_set_updated_at
  before update on public.workout_plans
  for each row execute function public.set_updated_at();

alter table public.workout_plans enable row level security;
alter table public.workout_plans force row level security;

create policy workout_plans_all_own on public.workout_plans
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- D39/D40: LifeOS ships three seeded starter plans with Ayman's own rep targets hardcoded. They do
-- not port as seeds. Three people use this app and none of them should open Fitness to find someone
-- else's programme presented as theirs; an empty plan list with a "create your first plan" prompt is
-- the honest first-run state.
comment on table public.workout_plans is
  'Training plans. Exactly one may be active per user. Deliberately NOT seeded -- LifeOS''s three '
  'starter plans encode one person''s targets, and a first run must not present them as the '
  'user''s own (D39, D40).';

create table public.plan_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_id bigint not null references public.workout_plans (id) on delete cascade,
  name text not null,
  -- ISO weekdays (1=Mon..7=Sun) this session is scheduled on. Same numbering habits.schedule and
  -- profiles.weekday_baselines already use -- three different weekday conventions in one schema is
  -- a bug generator.
  schedule_days smallint[] not null default '{}',
  start_time time,
  duration_minutes smallint check (duration_minutes is null or duration_minutes > 0),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plan_sessions_name_not_blank check (btrim(name) <> '')
);

create index plan_sessions_plan_idx on public.plan_sessions (plan_id, sort_order);

create trigger plan_sessions_set_updated_at
  before update on public.plan_sessions
  for each row execute function public.set_updated_at();

alter table public.plan_sessions enable row level security;
alter table public.plan_sessions force row level security;

create policy plan_sessions_all_own on public.plan_sessions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.plan_session_exercises (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  plan_session_id bigint not null references public.plan_sessions (id) on delete cascade,
  exercise_id bigint not null references public.exercises (id) on delete restrict,
  target_sets smallint check (target_sets is null or target_sets > 0),
  target_reps_low smallint check (target_reps_low is null or target_reps_low > 0),
  target_reps_high smallint check (target_reps_high is null or target_reps_high > 0),
  target_load numeric(7, 2) check (target_load is null or target_load >= 0),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now(),
  constraint plan_session_exercises_rep_range
    check (
      target_reps_low is null
      or target_reps_high is null
      or target_reps_high >= target_reps_low
    )
);

create index plan_session_exercises_session_idx
  on public.plan_session_exercises (plan_session_id, sort_order);

alter table public.plan_session_exercises enable row level security;
alter table public.plan_session_exercises force row level security;

create policy plan_session_exercises_all_own on public.plan_session_exercises
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- 3. Performed -- what actually happened
-- ============================================================================

create table public.workout_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  -- Null for an unplanned workout. `on delete set null` rather than cascade: deleting a plan must
  -- never delete the record of training that was actually done under it.
  plan_session_id bigint references public.plan_sessions (id) on delete set null,
  -- The Hour this training was logged inside, when there was one. Nullable because a workout is
  -- usually just logged, not timed -- but when it IS an Hour, this is the join that lets Fitness
  -- read one session table with everything else (D27).
  task_session_id bigint references public.task_sessions (id) on delete set null,
  notes text,
  -- A session is a draft until confirmed, which is what makes "confirmed sets this week" a real
  -- number rather than a count of half-entered rows.
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workout_sessions_user_date_idx on public.workout_sessions (user_id, local_date desc);

create trigger workout_sessions_set_updated_at
  before update on public.workout_sessions
  for each row execute function public.set_updated_at();

alter table public.workout_sessions enable row level security;
alter table public.workout_sessions force row level security;

create policy workout_sessions_all_own on public.workout_sessions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.session_sets (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  workout_session_id bigint not null references public.workout_sessions (id) on delete cascade,
  exercise_id bigint not null references public.exercises (id) on delete restrict,
  -- One row per performed set, not a sets-count column: per-set reps and load are the raw material
  -- of every progression read, and a collapsed count throws them away permanently.
  reps smallint check (reps is null or reps >= 0),
  load numeric(7, 2) check (load is null or load >= 0),
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create index session_sets_session_idx on public.session_sets (workout_session_id, sort_order);
create index session_sets_user_exercise_idx on public.session_sets (user_id, exercise_id);

alter table public.session_sets enable row level security;
alter table public.session_sets force row level security;

create policy session_sets_all_own on public.session_sets
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- 4. Cycles and measurement
-- ============================================================================

-- One anchor per user; the 4-week cycle is a pure function over it (packages/core), not stored
-- state. Same argument as migration 42's: a derived cycle cannot drift, and nothing needs a cron to
-- roll it over.
create table public.fitness_cycle_anchor (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  anchor_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger fitness_cycle_anchor_set_updated_at
  before update on public.fitness_cycle_anchor
  for each row execute function public.set_updated_at();

alter table public.fitness_cycle_anchor enable row level security;
alter table public.fitness_cycle_anchor force row level security;

create policy fitness_cycle_anchor_all_own on public.fitness_cycle_anchor
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.body_metrics (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  -- Units are named in the column rather than left to a convention nobody can see. LifeOS is
  -- lb/in; keeping his units avoids a conversion that would silently rewrite his history if his
  -- data is ever imported.
  weight_lb numeric(6, 2) check (weight_lb is null or weight_lb > 0),
  waist_in numeric(5, 2) check (waist_in is null or waist_in > 0),
  created_at timestamptz not null default now(),
  constraint body_metrics_one_per_day unique (user_id, local_date),
  constraint body_metrics_records_something
    check (weight_lb is not null or waist_in is not null)
);

create index body_metrics_user_date_idx on public.body_metrics (user_id, local_date desc);

alter table public.body_metrics enable row level security;
alter table public.body_metrics force row level security;

create policy body_metrics_all_own on public.body_metrics
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.fitness_benchmarks (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  exercise_id bigint not null references public.exercises (id) on delete cascade,
  local_date date not null,
  max_reps smallint check (max_reps is null or max_reps >= 0),
  max_load numeric(7, 2) check (max_load is null or max_load >= 0),
  created_at timestamptz not null default now(),
  constraint fitness_benchmarks_records_something
    check (max_reps is not null or max_load is not null)
);

create index fitness_benchmarks_user_exercise_idx
  on public.fitness_benchmarks (user_id, exercise_id, local_date desc);

alter table public.fitness_benchmarks enable row level security;
alter table public.fitness_benchmarks force row level security;

create policy fitness_benchmarks_all_own on public.fitness_benchmarks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
