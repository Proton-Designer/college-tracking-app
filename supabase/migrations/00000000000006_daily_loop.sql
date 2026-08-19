-- Daily loop: morning check-in, the day's prediction (scored at night for calibration
-- training), and the night review. One row per user per local_date -- day-scoped tables
-- per docs/DATA_MODEL.md "Timezone", local_date supplied directly by the app (these rows
-- ARE the day, not derived from some other instant).

create table public.daily_checkins (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  energy smallint not null check (energy between 1 and 10),
  mood smallint not null check (mood between 1 and 10),
  derailment_reason text,
  -- Snapshot of packages/core's Floor/Target/Stretch computation (§7) at check-in time,
  -- for retrospective "was today's plan realistic" analysis -- not the live source of truth.
  capacity_minutes numeric(7, 2),
  floor_minutes numeric(7, 2),
  target_minutes numeric(7, 2),
  recovery_mode_triggered boolean not null default false,
  recovery_mode_total smallint,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create index daily_checkins_user_id_idx on public.daily_checkins (user_id);

alter table public.daily_checkins enable row level security;
alter table public.daily_checkins force row level security;

create policy daily_checkins_all_own on public.daily_checkins
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.daily_predictions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  predicted_completion_pct numeric(5, 2) not null check (predicted_completion_pct between 0 and 100),
  expected_energy_tonight smallint check (expected_energy_tonight between 1 and 10),
  hardest_task_id bigint references public.tasks (id) on delete set null,
  likely_failure_mode text,
  -- Filled in from the matching daily_review at night -- this is the calibration signal.
  actual_completion_pct numeric(5, 2) check (actual_completion_pct between 0 and 100),
  scored_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create index daily_predictions_user_id_idx on public.daily_predictions (user_id);

alter table public.daily_predictions enable row level security;
alter table public.daily_predictions force row level security;

create policy daily_predictions_all_own on public.daily_predictions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- proud_text / went_wrong_text / important_note_text are free-text reflection, as
-- sensitive as journal_entries -- same handling rules apply (never sent to Haiku-tier
-- calls, never logged, never in error reports; see docs/LLM_LAYER_SPEC.md §7).
create table public.daily_reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  mits_planned smallint not null default 0 check (mits_planned >= 0),
  mits_completed smallint not null default 0 check (mits_completed >= 0),
  deep_work_planned_min integer check (deep_work_planned_min is null or deep_work_planned_min >= 0),
  deep_work_actual_min integer check (deep_work_actual_min is null or deep_work_actual_min >= 0),
  screen_time_min integer check (screen_time_min is null or screen_time_min >= 0),
  distracting_time_min integer check (distracting_time_min is null or distracting_time_min >= 0),
  workout_completed boolean,
  kill_list_success_count smallint check (kill_list_success_count >= 0),
  kill_list_total smallint check (kill_list_total >= 0),
  proud_text text,
  went_wrong_text text,
  important_note_text text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, local_date),
  constraint daily_reviews_mits_completed_le_planned check (mits_completed <= mits_planned),
  constraint daily_reviews_kill_success_le_total check (kill_list_success_count <= kill_list_total)
);

create index daily_reviews_user_id_idx on public.daily_reviews (user_id);

alter table public.daily_reviews enable row level security;
alter table public.daily_reviews force row level security;

create policy daily_reviews_all_own on public.daily_reviews
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
