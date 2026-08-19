-- Intelligence cluster: the summary pyramid, agent reports, code-gated insights and the
-- experiment engine, append-only risk/grade snapshots, and LLM cost accounting.
-- See docs/LLM_LAYER_SPEC.md and docs/DOMAIN_ENGINE_SPEC.md §10.

-- ============================================================================
-- Summary pyramid (LLM_LAYER_SPEC §5): raw events -> daily -> 7-day -> 30-day ->
-- semester durable lessons. `summary` is jsonb because the shape is an internal,
-- Claude-facing compaction format, not a queried structure -- see docs/DATA_MODEL.md.
-- ============================================================================
create table public.daily_summaries (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create index daily_summaries_user_id_idx on public.daily_summaries (user_id);

alter table public.daily_summaries enable row level security;
alter table public.daily_summaries force row level security;

create policy daily_summaries_all_own on public.daily_summaries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.weekly_summaries (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start_date date not null,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_start_date)
);

create index weekly_summaries_user_id_idx on public.weekly_summaries (user_id);

alter table public.weekly_summaries enable row level security;
alter table public.weekly_summaries force row level security;

create policy weekly_summaries_all_own on public.weekly_summaries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.monthly_summaries (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  month_start_date date not null,
  summary jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, month_start_date)
);

create index monthly_summaries_user_id_idx on public.monthly_summaries (user_id);

alter table public.monthly_summaries enable row level security;
alter table public.monthly_summaries force row level security;

create policy monthly_summaries_all_own on public.monthly_summaries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- agent_reports: every validated LLM output (nightly/weekly/monthly/semester/coach
-- turn), stored as its typed payload (docs/LLM_LAYER_SPEC.md §3).
-- ============================================================================
create table public.agent_reports (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  report_type text not null
    check (report_type in ('nightly', 'weekly', 'monthly', 'semester', 'coach_turn')),
  payload jsonb not null,
  model text not null,
  created_at timestamptz not null default now()
);

create index agent_reports_user_id_idx on public.agent_reports (user_id);
create index agent_reports_local_date_idx on public.agent_reports (user_id, local_date);
create index agent_reports_type_idx on public.agent_reports (user_id, report_type);

alter table public.agent_reports enable row level security;
alter table public.agent_reports force row level security;

create policy agent_reports_all_own on public.agent_reports
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Durable, semester-level lessons carried forward across terms -- the highest tier of
-- the summary pyramid. Append-only: no update/delete policy below, so FORCE ROW LEVEL
-- SECURITY denies both by default even for the owning user.
create table public.semester_lessons (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  term text not null,
  lesson text not null,
  confidence public.insight_confidence_level not null default 'testing',
  source_report_id bigint references public.agent_reports (id) on delete set null,
  created_at timestamptz not null default now()
);

create index semester_lessons_user_id_idx on public.semester_lessons (user_id);

alter table public.semester_lessons enable row level security;
alter table public.semester_lessons force row level security;

create policy semester_lessons_select_own on public.semester_lessons
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy semester_lessons_insert_own on public.semester_lessons
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- insights / experiments: observe -> hypothesize -> N-of-1 experiment -> measure.
-- confidence_stored is ALWAYS min(confidence_claimed_by_model, what packages/core's
-- gateInsightConfidence permits from sample_size/effect_size) -- enforced in application
-- code (clampInsightConfidence) before insert, not by a DB trigger, since the gate's
-- logic already lives in packages/core and duplicating it in SQL would be a second
-- source of truth. See docs/DOMAIN_ENGINE_SPEC.md §10.
-- ============================================================================
create table public.insights (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  claim text not null,
  evidence jsonb,
  confidence_claimed_by_model public.insight_confidence_level,
  confidence_stored public.insight_confidence_level not null,
  sample_size integer not null check (sample_size >= 0),
  effect_size numeric,
  status text not null default 'active'
    check (status in ('active', 'promoted_to_experiment', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index insights_user_id_idx on public.insights (user_id);

create trigger insights_set_updated_at
  before update on public.insights
  for each row execute function public.set_updated_at();

alter table public.insights enable row level security;
alter table public.insights force row level security;

create policy insights_all_own on public.insights
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.experiments (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  insight_id bigint references public.insights (id) on delete set null,
  hypothesis text not null,
  protocol text,
  start_date date not null,
  end_date date,
  status text not null default 'proposed'
    check (status in ('proposed', 'running', 'completed', 'abandoned')),
  outcome_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint experiments_date_order check (end_date is null or end_date >= start_date)
);

create index experiments_user_id_idx on public.experiments (user_id);
create index experiments_insight_id_idx on public.experiments (insight_id);

create trigger experiments_set_updated_at
  before update on public.experiments
  for each row execute function public.set_updated_at();

alter table public.experiments enable row level security;
alter table public.experiments force row level security;

create policy experiments_all_own on public.experiments
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.experiment_measurements (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  experiment_id bigint not null references public.experiments (id) on delete cascade,
  local_date date not null,
  metric text not null,
  value numeric not null,
  created_at timestamptz not null default now()
);

create index experiment_measurements_user_id_idx on public.experiment_measurements (user_id);
create index experiment_measurements_experiment_id_idx
  on public.experiment_measurements (experiment_id);

alter table public.experiment_measurements enable row level security;
alter table public.experiment_measurements force row level security;

create policy experiment_measurements_all_own on public.experiment_measurements
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- risk_snapshots / grade_snapshots: append-only history written by the nightly job, for
-- trend display ("your BME risk has climbed for 5 days"). NEVER read as current truth --
-- current risk/grades are always recomputed live by packages/core. Append-only is
-- enforced structurally: no update/delete policy, so FORCE ROW LEVEL SECURITY denies
-- both by default.
-- ============================================================================
create table public.risk_snapshots (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  scope text not null check (scope in ('course', 'deliverable')),
  course_id bigint references public.courses (id) on delete cascade,
  deliverable_id bigint references public.deliverables (id) on delete cascade,
  snapshot_date date not null,
  score smallint not null check (score between 0 and 100),
  band public.risk_band not null,
  trace jsonb not null,
  confidence public.confidence_level not null,
  created_at timestamptz not null default now(),
  constraint risk_snapshots_scope_target check (
    (scope = 'course' and course_id is not null and deliverable_id is null)
    or (scope = 'deliverable' and deliverable_id is not null and course_id is null)
  )
);

create index risk_snapshots_user_id_idx on public.risk_snapshots (user_id);
create index risk_snapshots_course_idx on public.risk_snapshots (user_id, course_id, snapshot_date);
create index risk_snapshots_deliverable_idx
  on public.risk_snapshots (user_id, deliverable_id, snapshot_date);

alter table public.risk_snapshots enable row level security;
alter table public.risk_snapshots force row level security;

create policy risk_snapshots_select_own on public.risk_snapshots
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy risk_snapshots_insert_own on public.risk_snapshots
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create table public.grade_snapshots (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id bigint not null references public.courses (id) on delete cascade,
  snapshot_date date not null,
  current_grade numeric(5, 2),
  projected_grade numeric(5, 2),
  assumption_used text,
  category_results jsonb not null,
  created_at timestamptz not null default now()
);

create index grade_snapshots_user_id_idx on public.grade_snapshots (user_id);
create index grade_snapshots_course_idx on public.grade_snapshots (user_id, course_id, snapshot_date);

alter table public.grade_snapshots enable row level security;
alter table public.grade_snapshots force row level security;

create policy grade_snapshots_select_own on public.grade_snapshots
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy grade_snapshots_insert_own on public.grade_snapshots
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- llm_usage_log: cost accounting for the budget gate (docs/LLM_LAYER_SPEC.md §6).
-- content_hash, never content -- journal text must never land here.
-- ============================================================================
create table public.llm_usage_log (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles (id) on delete cascade,
  call_type text not null,
  model text not null,
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  cache_read_tokens integer not null default 0 check (cache_read_tokens >= 0),
  cache_write_tokens integer not null default 0 check (cache_write_tokens >= 0),
  cost_usd numeric(10, 6) not null check (cost_usd >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  success boolean not null,
  content_hash text,
  created_at timestamptz not null default now()
);

create index llm_usage_log_user_id_idx on public.llm_usage_log (user_id);
-- Serves the budget gate's "sum this month's cost for this user" pre-flight check.
create index llm_usage_log_user_month_idx on public.llm_usage_log (user_id, created_at);

alter table public.llm_usage_log enable row level security;
alter table public.llm_usage_log force row level security;

-- User-facing "your usage" display. The budget gate itself runs as service_role inside
-- the Edge Function and bypasses RLS entirely, as service_role always does.
create policy llm_usage_log_select_own on public.llm_usage_log
  for select to authenticated
  using ((select auth.uid()) = user_id);
