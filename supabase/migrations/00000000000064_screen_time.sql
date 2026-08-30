-- Weekly screen time, self-reported by screenshot (D51).
--
-- iOS does not expose Screen Time to third-party apps, so this is deliberate self-report -- and
-- better for it, because uploading forces you to look. The upload is the intervention; the number
-- is the record.
--
-- It reuses the parse-stage-confirm pipeline that already exists for syllabi and announcements
-- rather than inventing a fourth shape, and inherits its two guarantees. **D10: nothing reaches
-- the confirmed series without an explicit user confirmation** -- there is no write path from a
-- staged row to `screen_time_weeks` that does not pass through a person. And the no-guessing rule:
-- a value the model cannot read becomes a field the user fills, never an invented number.

-- ============================================================================
-- 1. The upload
-- ============================================================================

create table public.screen_time_uploads (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Monday..Sunday: the week the screenshot covers, from packages/core's startOfWeek (which
  -- returns the SUNDAY on or before -- see migration 53's note; every Sun-Sat strip in the app
  -- uses the same convention).
  week_start_date date not null,
  storage_path text not null,
  status text not null default 'pending'
    check (status in ('pending', 'parsed', 'confirmed', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Re-uploading a week replaces its staging rather than accumulating uploads nobody can tell
  -- apart. The confirmed series is separate and survives.
  constraint screen_time_uploads_one_per_week unique (user_id, week_start_date)
);

create index screen_time_uploads_user_idx on public.screen_time_uploads (user_id, week_start_date desc);

create trigger screen_time_uploads_set_updated_at
  before update on public.screen_time_uploads
  for each row execute function public.set_updated_at();

alter table public.screen_time_uploads enable row level security;
alter table public.screen_time_uploads force row level security;

create policy screen_time_uploads_all_own on public.screen_time_uploads
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- 2. Staging -- what the model read, and what it could not
-- ============================================================================

create table public.screen_time_extractions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  upload_id bigint not null references public.screen_time_uploads (id) on delete cascade,
  -- 'total' is the week's daily average; 'category' and 'app' are the breakdown rows.
  item_type text not null check (item_type in ('total', 'category', 'app')),
  label text,
  -- NULLABLE, and this is the no-guessing rule in the schema rather than in the prompt. A value
  -- the model could not read with confidence lands here as NULL with `needs_input = true`, and the
  -- confirmation UI renders an empty field for the user to fill. An invented number would be
  -- indistinguishable from a read one the moment it is confirmed.
  minutes integer check (minutes is null or minutes >= 0),
  needs_input boolean not null default false,
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  -- What the model saw, so the user verifies against the screenshot rather than trusting the read.
  source_snippet text,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected', 'edited')),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  -- A row is either readable or flagged for input; claiming both is a contradiction, and claiming
  -- neither is a row with no number and no reason for not having one.
  constraint screen_time_extractions_value_or_prompt
    check ((minutes is not null) <> needs_input)
);

create index screen_time_extractions_upload_idx on public.screen_time_extractions (upload_id);

alter table public.screen_time_extractions enable row level security;
alter table public.screen_time_extractions force row level security;

create policy screen_time_extractions_all_own on public.screen_time_extractions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- 3. The confirmed series
-- ============================================================================

create table public.screen_time_weeks (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start_date date not null,
  -- Daily average across the week, as Screen Time reports it.
  daily_average_minutes integer not null check (daily_average_minutes >= 0),
  -- The breakdown, as confirmed. jsonb because the categories are Apple's and change between iOS
  -- versions; typed columns would need a migration every autumn.
  breakdown jsonb not null default '{}'::jsonb,
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint screen_time_weeks_one_per_week unique (user_id, week_start_date)
);

create index screen_time_weeks_user_idx on public.screen_time_weeks (user_id, week_start_date desc);

alter table public.screen_time_weeks enable row level security;
alter table public.screen_time_weeks force row level security;

create policy screen_time_weeks_all_own on public.screen_time_weeks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- D51: a missed week is a GAP, not a broken streak. There is no streak column here and no
-- "weeks_in_a_row" anywhere -- the series simply has a hole, and every chart renders it as one.
-- That is the same ruling D23/D29/D30 made three times already; this is the fourth place it would
-- have been easy to reintroduce.
comment on table public.screen_time_weeks is
  'Confirmed weekly screen time. A missing week is a GAP rendered as a hole in the series, never a '
  'broken streak (D51). Nothing writes here except an explicit user confirmation (D10).';

-- C9 still holds: every policy above is single-owner. Sharing this between the three users is a
-- real product idea and a real hazard -- screen time is the one number people actually feel shame
-- about -- and if it is ever built it needs its own ruling and its own opt-in, not a flag on this
-- table.
