-- Tier 1 of docs/BLUEPRINT_PLAN.md: the thin layer around the Work Engine -- the Cards
-- library that the End-of-Hour rotation draws from, the Worry List capture inbox, and the
-- positive-habit layer with its identity votes.
--
-- Ruling C6: `habits` lives ALONGSIDE `kill_habits`, never merged. They are opposites --
-- kill_habits is quit-with-escalation (trigger, urge, replacement, a 5-level commitment
-- ladder), this is build-with-identity-votes. Merging them would produce one table where
-- half the columns are always null depending on which kind of habit a row is.

-- ============================================================================
-- 1. cards -- the wall, digitised
-- ============================================================================

-- ENUM per migration 0002's policy: a closed set we control, mirroring a packages/core
-- union, from the source material's fixed taxonomy and not expected to churn.
create type public.card_type as enum (
  'goal',
  'motivation',
  'thought_habit',
  'trait',
  'tenx'
);

create table public.cards (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  type public.card_type not null,
  text text not null,
  -- Relative likelihood in the End-of-Hour rotation. Higher shows more often. A card the
  -- user is tired of gets weighted down rather than deleted, so the wall keeps its history.
  weight numeric(4, 2) not null default 1 check (weight >= 0),
  -- Retired rather than deleted, same reasoning as weight.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cards_text_not_blank check (btrim(text) <> '')
);

create index cards_user_active_idx on public.cards (user_id, active);

create trigger cards_set_updated_at
  before update on public.cards
  for each row execute function public.set_updated_at();

alter table public.cards enable row level security;
alter table public.cards force row level security;

create policy cards_all_own on public.cards
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.cards is
  'The Cards library -- goals, motivation items, thought habits, 2.0 traits, the 10X card. '
  'Shown only in rotation at End-of-Hour and Morning Start. NOTE: card_type ''goal'' is a '
  'CARD, not the War Map goal record; War Map Lite (Tier 3) gets its own table.';

-- ============================================================================
-- 2. worries -- the capture inbox Monday Hour 1 clears
-- ============================================================================

create table public.worries (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  text text not null,
  -- text + CHECK, not an enum: migration 0002's policy reserves enums for closed sets, and
  -- explicitly names status vocabularies as the kind expected to grow during active UI work.
  status text not null default 'open'
    check (status in ('open', 'handling', 'done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint worries_text_not_blank check (btrim(text) <> '')
);

create index worries_user_status_idx on public.worries (user_id, status);

create trigger worries_set_updated_at
  before update on public.worries
  for each row execute function public.set_updated_at();

alter table public.worries enable row level security;
alter table public.worries force row level security;

create policy worries_all_own on public.worries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- 3. habits + habit_logs -- identity votes
-- ============================================================================

create table public.habits (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  -- "a vote for the athlete". Identity framing beats outcome framing (BLUEPRINT 1B), and
  -- it is the sentence the check-in UI actually renders, so it is a first-class column.
  identity text not null,
  -- One line of evidence from the research, shown on the habit. Optional: a habit the user
  -- invented has no citation, and inventing one would be worse than leaving it blank.
  why_card text,
  -- { "weekdays": [1..7] }, ISO weekday numbers with 1 = Monday. Which days COUNT as
  -- scheduled -- a miss only dents the score on a day the habit was actually due.
  schedule jsonb not null default '{"weekdays": [1,2,3,4,5,6,7]}'::jsonb,
  -- Paused freezes the score instead of decaying it (BLUEPRINT: travel and sick days must
  -- not break the system).
  paused boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint habits_name_not_blank check (btrim(name) <> ''),
  constraint habits_identity_not_blank check (btrim(identity) <> ''),
  constraint habits_schedule_has_weekdays
    check (jsonb_typeof(schedule -> 'weekdays') = 'array')
);

create index habits_user_active_idx on public.habits (user_id, active);

create trigger habits_set_updated_at
  before update on public.habits
  for each row execute function public.set_updated_at();

alter table public.habits enable row level security;
alter table public.habits force row level security;

create policy habits_all_own on public.habits
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- NOTE: there is deliberately NO `score` or `votes` column here, and the blueprint's data
-- model has both.
--
-- Both are derivable from habit_logs plus the schedule, and deriving them means there is no
-- second copy to drift and no nightly cron whose failure silently freezes everyone's score
-- at yesterday's value. `packages/core` computes the decaying score by replaying the log,
-- which also makes it a pure function with real unit tests instead of an accumulated
-- number nothing can check. Same rule daily_checkins already states about its capacity
-- snapshot: the stored thing is not the live source of truth.
--
-- The blueprint's cap of 7 visible habits is enforced in the app, not here: a row-count
-- constraint would also block the eighth row a user creates while retiring another, which
-- is a legitimate sequence.
comment on table public.habits is
  'Positive keystone habits with identity framing. Deliberately separate from kill_habits '
  '(ruling C6) -- that table is habits to QUIT, with an escalation ladder. Score and vote '
  'count are DERIVED from habit_logs in packages/core, never stored here.';

create table public.habit_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  habit_id bigint not null references public.habits (id) on delete cascade,
  -- The local calendar day the vote is for. Supplied by the caller, which computed it
  -- through packages/core's localDateFromInstant. Day boundaries are ALWAYS local.
  local_date date not null,
  -- A row is a vote. `done = false` records a deliberate "not today" distinctly from the
  -- absence of a row, which means the day simply has not been answered yet -- the same
  -- untracked-vs-failure distinction toDayOutcomes draws for Day Won.
  done boolean not null default true,
  created_at timestamptz not null default now(),
  unique (habit_id, local_date)
);

create index habit_logs_user_date_idx on public.habit_logs (user_id, local_date);
create index habit_logs_habit_idx on public.habit_logs (habit_id, local_date);

alter table public.habit_logs enable row level security;
alter table public.habit_logs force row level security;

create policy habit_logs_all_own on public.habit_logs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
