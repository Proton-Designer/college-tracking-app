-- Tasks/execution cluster: the day-to-day work items (course-linked or personal) and
-- the focus sessions logged against them.

create table public.tasks (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id bigint references public.courses (id) on delete set null,
  deliverable_id bigint references public.deliverables (id) on delete set null,
  title text not null,
  -- Bucket used by packages/core's duration calibration (§3), e.g. 'coding',
  -- 'lab_report', 'reading', 'admin'. Free text + no FK: the set of categories a user
  -- accumulates is personal and open-ended, not a closed vocabulary we control.
  category text not null,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  actual_minutes integer check (actual_minutes is null or actual_minutes >= 0),
  planned_date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'in_progress', 'completed', 'cancelled')),
  requires_proof_of_work boolean not null default false,
  proof_of_work_type text
    check (proof_of_work_type is null or proof_of_work_type in (
      'confirmation_attachment', 'practice_question_count', 'git_commit', 'summary_text', 'whoop_workout'
    )),
  proof_of_work_content text,
  -- Rank 1-3 among a day's Top 3 MITs. A partial unique index below enforces at most one
  -- task per rank per day -- not a NOT NULL column, since most tasks aren't a MIT.
  mit_rank smallint check (mit_rank between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint tasks_proof_requires_type
    check (not requires_proof_of_work or proof_of_work_type is not null)
);

create index tasks_user_id_idx on public.tasks (user_id);
create index tasks_course_id_idx on public.tasks (course_id);
create index tasks_deliverable_id_idx on public.tasks (deliverable_id);
create index tasks_planned_date_idx on public.tasks (user_id, planned_date);
create unique index tasks_mit_rank_per_day_idx
  on public.tasks (user_id, planned_date, mit_rank)
  where mit_rank is not null;

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();

alter table public.tasks enable row level security;
alter table public.tasks force row level security;

create policy tasks_all_own on public.tasks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- task_sessions: focus-session log per packages/core §3 (calibration) and the brief's
-- focus-session intelligence. Not day-scoped-unique -- a task can have multiple sessions.
-- ============================================================================
create table public.task_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  task_id bigint not null references public.tasks (id) on delete cascade,
  planned_start timestamptz not null,
  actual_start timestamptz,
  planned_duration_min integer not null check (planned_duration_min > 0),
  actual_duration_min integer check (actual_duration_min is null or actual_duration_min >= 0),
  location text,
  interruptions smallint not null default 0 check (interruptions >= 0),
  subjective_focus smallint check (subjective_focus between 1 and 5),
  objective_output text,
  phone_usage_min integer check (phone_usage_min is null or phone_usage_min >= 0),
  created_at timestamptz not null default now()
);

create index task_sessions_user_id_idx on public.task_sessions (user_id);
create index task_sessions_task_id_idx on public.task_sessions (task_id);

alter table public.task_sessions enable row level security;
alter table public.task_sessions force row level security;

create policy task_sessions_all_own on public.task_sessions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
