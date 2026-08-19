-- Telemetry cluster: the generic raw-ingest sink plus typed daily rollups, and calendar
-- events. Direction is always raw -> rollup: health_daily/screen_daily are derived and
-- rebuildable from telemetry_events, never the primary record themselves. Whatever writes
-- a rollup should be able to be re-run from telemetry_events and get the same answer.

create table public.telemetry_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  occurred_at timestamptz not null default now(),
  local_date date not null,
  source text not null,
  type text not null,
  metric text not null,
  value numeric not null,
  unit text,
  created_at timestamptz not null default now()
);

create index telemetry_events_user_id_idx on public.telemetry_events (user_id);
create index telemetry_events_local_date_idx on public.telemetry_events (user_id, local_date);
create index telemetry_events_source_type_idx on public.telemetry_events (user_id, source, type);

create trigger telemetry_events_sync_local_date
  before insert or update of occurred_at, user_id on public.telemetry_events
  for each row execute function public.sync_local_date_from_occurred_at();

alter table public.telemetry_events enable row level security;
alter table public.telemetry_events force row level security;

create policy telemetry_events_all_own on public.telemetry_events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- health_daily / screen_daily: typed rollups. Rebuildable from telemetry_events -- see
-- table comment above. Day-scoped-unique, local_date supplied directly (this row IS the
-- day's summary, same reasoning as the daily_loop cluster).
-- ============================================================================
create table public.health_daily (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  sleep_hours numeric(4, 2) check (sleep_hours is null or sleep_hours between 0 and 24),
  whoop_recovery_pct numeric(5, 2) check (whoop_recovery_pct is null or whoop_recovery_pct between 0 and 100),
  hrv_ms numeric(6, 2),
  resting_hr numeric(5, 2),
  strain numeric(5, 2),
  workout_completed boolean,
  source text not null default 'whoop',
  created_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create index health_daily_user_id_idx on public.health_daily (user_id);

alter table public.health_daily enable row level security;
alter table public.health_daily force row level security;

create policy health_daily_all_own on public.health_daily
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.screen_daily (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  total_screen_min integer check (total_screen_min is null or total_screen_min >= 0),
  distracting_min integer check (distracting_min is null or distracting_min >= 0),
  productive_min integer check (productive_min is null or productive_min >= 0),
  source text not null default 'rescuetime',
  created_at timestamptz not null default now(),
  unique (user_id, local_date)
);

create index screen_daily_user_id_idx on public.screen_daily (user_id);

alter table public.screen_daily enable row level security;
alter table public.screen_daily force row level security;

create policy screen_daily_all_own on public.screen_daily
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Per-app breakdown feeding screen_daily -- many rows per day, one per app/source.
create table public.app_usage (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  app_name text not null,
  category text,
  minutes integer not null check (minutes >= 0),
  source text not null default 'rescuetime',
  created_at timestamptz not null default now(),
  unique (user_id, local_date, app_name, source)
);

create index app_usage_user_id_idx on public.app_usage (user_id);
create index app_usage_local_date_idx on public.app_usage (user_id, local_date);

alter table public.app_usage enable row level security;
alter table public.app_usage force row level security;

create policy app_usage_all_own on public.app_usage
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- calendar_events: imported (ICS/Google) or manually-added events. Feeds free-time
-- detection for backplanning/capacity and, via is_class_meeting, attendance obligations.
-- ============================================================================
create table public.calendar_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Id from the source system, for dedup on re-sync. Null for manually-added events.
  external_id text,
  source text not null default 'manual' check (source in ('ics', 'google', 'manual')),
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  is_busy boolean not null default true,
  is_class_meeting boolean not null default false,
  course_id bigint references public.courses (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_events_time_order check (end_at > start_at)
);

create index calendar_events_user_id_idx on public.calendar_events (user_id);
create index calendar_events_course_id_idx on public.calendar_events (course_id);
create index calendar_events_start_at_idx on public.calendar_events (user_id, start_at);
create unique index calendar_events_external_dedup_idx
  on public.calendar_events (user_id, source, external_id)
  where external_id is not null;

create trigger calendar_events_set_updated_at
  before update on public.calendar_events
  for each row execute function public.set_updated_at();

alter table public.calendar_events enable row level security;
alter table public.calendar_events force row level security;

create policy calendar_events_all_own on public.calendar_events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
