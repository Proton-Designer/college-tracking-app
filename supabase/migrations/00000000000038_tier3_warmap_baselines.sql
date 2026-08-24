-- Tier 3: War Map Lite (BLUEPRINT IV-B) and per-weekday Hour baselines (Part II item 5).
--
-- War Map LITE, deliberately: Top 5 Goals -> one monthly milestone per goal -> the nightly
-- plan pulls from milestones. The blueprint itself calls the full annual grid "a
-- spreadsheet cosplaying as software" and this schema takes it at its word -- no annual
-- layer, no quarters, nothing between a goal and its current monthly milestone.
--
-- NOTE for readers of migration 35: cards of type 'goal' are CARDS (rotation content, a
-- sentence to re-read). These rows are the goal RECORDS -- number, deadline, reason. The
-- card is the wall copy; this is the ledger. They are deliberately not one table.

create table public.goals (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  -- The measurable number attached to the goal ("$10k MRR", "3.8 GPA"). Free text because
  -- goal metrics are heterogeneous; the number's meaning lives with the user.
  number text,
  deadline date,
  reason text,
  -- 1-5. The blueprint's cap is five ACTIVE goals; enforced app-side like the habit cap
  -- (a positional unique index would fight reordering, same reasoning as MAX_ACTIVE_HABITS).
  position smallint not null check (position between 1 and 5),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_title_not_blank check (btrim(title) <> '')
);

create index goals_user_active_idx on public.goals (user_id, active);

create trigger goals_set_updated_at
  before update on public.goals
  for each row execute function public.set_updated_at();

alter table public.goals enable row level security;
alter table public.goals force row level security;

create policy goals_all_own on public.goals
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.milestones (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  goal_id bigint not null references public.goals (id) on delete cascade,
  -- 'YYYY-MM': the month this milestone belongs to, in the user's local calendar. One per
  -- goal per month, enforced below -- "one monthly milestone per goal" is the Lite
  -- discipline, and letting a second one in would quietly regrow the grid.
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  title text not null,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (goal_id, month),
  constraint milestones_title_not_blank check (btrim(title) <> '')
);

create index milestones_user_month_idx on public.milestones (user_id, month);

create trigger milestones_set_updated_at
  before update on public.milestones
  for each row execute function public.set_updated_at();

alter table public.milestones enable row level security;
alter table public.milestones force row level security;

create policy milestones_all_own on public.milestones
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- Per-weekday baselines
-- ============================================================================

-- {"1": 4, "2": 2, ...} -- ISO weekday -> Hours, same numbering habits.schedule uses.
-- On profiles, not on days: it is the STANDING standard the day inherits at creation.
-- days.baseline_hours (migration 34) stays and stays authoritative for its day -- it is
-- the snapshot this default flows into, and a per-day override edits the snapshot, never
-- this map. Missing weekday keys fall back to the days column default (4), so an empty
-- map changes nothing for existing users.
alter table public.profiles
  add column weekday_baselines jsonb not null default '{}'::jsonb
  constraint profiles_weekday_baselines_is_object check (jsonb_typeof(weekday_baselines) = 'object');

comment on column public.profiles.weekday_baselines is
  'ISO weekday (1=Mon..7=Sun, as text keys) -> baseline Hours for that weekday. The '
  'standing standard days.baseline_hours inherits at day creation; missing keys fall back '
  'to that column''s default. BLUEPRINT Part II item 5: the baseline must fit the real '
  'schedule or Day Won stops being honest.';
