-- The Deen domain. Ported from LifeOS per the merge directive's rule 3.4 ("port the module
-- whole"), authored fresh here because his migrations 001-015 do not exist in his repo and his
-- base schema cannot be replayed from it (D42). His `database.types.ts` is the specification of
-- record; his pure logic modules are the behavioural spec.
--
-- Deliberate divergences from his schema, each for a reason recorded at the point it is made:
--
--  * No prayer streak column anywhere. D30: qada means a miss is a debt to repay, not a chain that
--    resets, so a consecutive-day counter is both D23-noncompliant and off-key against the domain's
--    own theology. What the streak was standing on -- days cleared, on-time rate, the heatmap, the
--    backlog -- is all derivable from the rows below.
--
--  * No stored "missed" marker written by a job. Status is derived at read time in
--    packages/core/src/deen/prayerStatus.ts: no cron, no race with a user's tap, correct the
--    instant a window closes. A row exists here only because a person recorded something. That is
--    migration 42's rule (derived state cannot drift from its log) applied where being wrong would
--    be worse than usual.
--
--  * profiles.qada_owed (migration 49) stays the hand-tracked PRE-APP debt and is not merged into
--    these rows. The app cannot verify it and must not silently absorb it into a number it computed.

-- ============================================================================
-- 1. Enums
-- ============================================================================

-- Closed sets, fixed by the domain rather than accumulated by users -- migration 0002's enum policy.
create type public.prayer_name as enum ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha');

-- Only what a person can record. 'upcoming' and 'pending' are DERIVED states and deliberately
-- absent: they describe a window's relationship to now, which changes every minute, and storing
-- one would be storing a fact with an expiry date.
create type public.prayer_status as enum ('on_time', 'qada', 'missed');

-- ============================================================================
-- 2. prayers -- the salah log
-- ============================================================================

create table public.prayers (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  prayer_name public.prayer_name not null,
  status public.prayer_status not null,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One record per prayer per day. Re-tapping a prayer edits the record rather than appending a
  -- second opinion about the same obligation.
  constraint prayers_one_per_day unique (user_id, local_date, prayer_name)
);

create index prayers_user_date_idx on public.prayers (user_id, local_date desc);

create trigger prayers_set_updated_at
  before update on public.prayers
  for each row execute function public.set_updated_at();

alter table public.prayers enable row level security;
alter table public.prayers force row level security;

create policy prayers_all_own on public.prayers
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.prayers is
  'The salah log. A row exists only where a person recorded something; everything else -- missed, '
  'pending, upcoming -- is derived at read time from the prayer windows. See D30 for why there is '
  'no streak, and packages/core/src/deen/prayerStatus.ts for the derivation.';

-- ============================================================================
-- 3. sunnah_logs and adhkar_logs -- the surrounding practice
-- ============================================================================

-- In his code but absent from the feature inventory; ported because the module goes over whole.
create type public.sunnah_slot as enum ('before', 'after');

create table public.sunnah_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  prayer_name public.prayer_name not null,
  slot public.sunnah_slot not null,
  created_at timestamptz not null default now(),
  constraint sunnah_logs_one_per_slot unique (user_id, local_date, prayer_name, slot)
);

create index sunnah_logs_user_date_idx on public.sunnah_logs (user_id, local_date desc);

alter table public.sunnah_logs enable row level security;
alter table public.sunnah_logs force row level security;

create policy sunnah_logs_all_own on public.sunnah_logs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Morning/evening remembrances. A presence row means done; absence means not done, which is why
-- there is no boolean column -- a false would be indistinguishable from never having been asked.
create type public.adhkar_period as enum ('morning', 'evening');

create table public.adhkar_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  period public.adhkar_period not null,
  created_at timestamptz not null default now(),
  constraint adhkar_logs_one_per_period unique (user_id, local_date, period)
);

create index adhkar_logs_user_date_idx on public.adhkar_logs (user_id, local_date desc);

alter table public.adhkar_logs enable row level security;
alter table public.adhkar_logs force row level security;

create policy adhkar_logs_all_own on public.adhkar_logs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- 4. quran_sessions
-- ============================================================================

create table public.quran_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  pages_read numeric(6, 2) check (pages_read is null or pages_read > 0),
  surah text,
  juz smallint check (juz is null or juz between 1 and 30),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A session that records nothing is not a session. Any one of the three is enough to make it
  -- real -- some people track pages, some track surah, some track juz.
  constraint quran_sessions_records_something
    check (pages_read is not null or btrim(coalesce(surah, '')) <> '' or juz is not null)
);

create index quran_sessions_user_date_idx on public.quran_sessions (user_id, local_date desc);

create trigger quran_sessions_set_updated_at
  before update on public.quran_sessions
  for each row execute function public.set_updated_at();

alter table public.quran_sessions enable row level security;
alter table public.quran_sessions force row level security;

create policy quran_sessions_all_own on public.quran_sessions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Multiple sessions per day are allowed on purpose: reading twice is two acts, and collapsing them
-- would lose the second one.
comment on table public.quran_sessions is
  'Qur''an reading sessions. Deliberately NOT unique per day -- reading twice is two acts.';

-- ============================================================================
-- 5. reflection_entries
-- ============================================================================

-- Light / Moderate / Heavy. An intensity, not a rating: the question is how much reflection
-- happened, never how good it was.
create type public.reflection_intensity as enum ('light', 'moderate', 'heavy');

create table public.reflection_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  intensity public.reflection_intensity not null,
  created_at timestamptz not null default now()
);

create index reflection_entries_user_date_idx on public.reflection_entries (user_id, local_date desc);

alter table public.reflection_entries enable row level security;
alter table public.reflection_entries force row level security;

create policy reflection_entries_all_own on public.reflection_entries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- M12: this is NOT journal_entries and the two must not merge. A reflection entry is a logged act
-- with an intensity and no text; a journal entry is prose, and CLAUDE.md's rules about journal
-- content being sensitive (never logged, never sent to an LLM beyond the minimum, never in an error
-- report) apply to that table and not to this one. Merging them would silently drag this table
-- under those constraints or, far worse, drag journal text out from under them.
comment on table public.reflection_entries is
  'Daily reflection intensity (light/moderate/heavy). Resets daily; history is never deleted. '
  'Distinct from journal_entries, which is prose and carries the sensitive-content rules (M12).';
