-- D39 -- Ihsan is a three-person app, so every preference below is per-user data on the
-- row that already exists for exactly this purpose. None of these is a constant, and none
-- of them may be read across users (C9 stands: every policy on this table is single-owner
-- and unchanged by this migration).
--
-- D40 governs the defaults: a default here is either a genuine sensible starting value
-- (a calculation method that only matters once a location exists) or it is NULL, which
-- the UI renders as "set this in Settings". Nothing defaults to a number that would look
-- like a measurement -- an unset prayer location shows a prompt, never 5:00 AM.

-- ============================================================================
-- 1. Location -- the anchor for prayer times and the day's shape
-- ============================================================================

alter table public.profiles
  -- All three NULL until the user sets a location. The Deen surfaces and Today's day-shape
  -- row check for this and render an honest empty state; nothing computes a prayer time
  -- from a fabricated coordinate.
  add column location_label text,
  add column location_lat numeric(8, 5)
    constraint profiles_location_lat_range check (location_lat is null or location_lat between -90 and 90),
  add column location_lng numeric(8, 5)
    constraint profiles_location_lng_range check (location_lng is null or location_lng between -180 and 180),
  -- Both halves of a coordinate or neither. A half-set location is a bug that would
  -- otherwise surface as a wrong prayer time rather than as a missing one.
  add constraint profiles_location_pair
    check ((location_lat is null) = (location_lng is null));

-- ============================================================================
-- 2. Prayer calculation -- real defaults, because they are inert without a location
-- ============================================================================

alter table public.profiles
  -- Muslim World League is the most widely applicable default; the set matches the
  -- angles implemented in packages/core. Text with a CHECK rather than an enum: this is a
  -- list that grows as more conventions are implemented, and each addition is a code
  -- change in the same commit as the constraint change.
  add column prayer_calc_method text not null default 'mwl'
    check (prayer_calc_method in ('mwl', 'isna', 'karachi', 'egyptian')),
  add column asr_madhab text not null default 'standard'
    check (asr_madhab in ('standard', 'hanafi')),
  -- Qada is Islam's own repair mechanic and the reason D30 could drop the prayer streak
  -- without losing anything. A plain owed-count, incremented when a prayer is logged
  -- missed and decremented when one is made up.
  add column qada_owed integer not null default 0
    check (qada_owed >= 0);

-- ============================================================================
-- 3. The allocation check-in window (D33)
-- ============================================================================

alter table public.profiles
  add column checkin_window_start time,
  add column checkin_window_end time,
  add column checkin_interval_minutes smallint not null default 120
    check (checkin_interval_minutes between 30 and 480),
  -- D33: the interrupting nudge ships OFF. The engine still computes windows, coverage
  -- and the close-out backfill without it; the notification is the opt-in part, not the
  -- measurement.
  add column checkin_nudge_enabled boolean not null default false,
  add constraint profiles_checkin_window_pair
    check ((checkin_window_start is null) = (checkin_window_end is null));

-- ============================================================================
-- 4. What counts as Signal (D38)
-- ============================================================================

-- LifeOS hardcodes Signal = Deen + Business. That is one person's priority ruling
-- compiled into a metric, and it is simply wrong for the other two people on this
-- project -- a student's School hours are not semi-noise.
--
-- Default is all five domains, which makes the metric mean what the directive says it
-- means: coverage, i.e. where all the time went, with wasted time as the only noise.
-- Narrowing this array is the "priority domains" lens and reproduces the original
-- behaviour exactly for whoever wants it.
alter table public.profiles
  add column signal_domains public.life_domain[] not null
    default array['deen', 'business', 'school', 'fitness', 'work']::public.life_domain[],
  add constraint profiles_signal_domains_not_empty
    check (array_length(signal_domains, 1) >= 1);

-- ============================================================================
-- 5. When tracking started
-- ============================================================================

-- LifeOS's stat tiles read "-- before you started tracking" instead of "0" for any window
-- that predates the user's first day. That is the same distinction packages/core already
-- enforces as "real zero is not absent", surfaced in the UI, and it is what keeps a
-- first-run dashboard honest instead of discouraging. NULL until the first tracked act.
alter table public.profiles
  add column tracking_started_on date;

comment on column public.profiles.signal_domains is
  'D38: which domains count as Signal in the Signal:Noise ratio. Default is all five '
  '(coverage semantics -- wasted time is the only noise); narrowing it is the per-user '
  'priority lens. Never a constant: three people use this app and they do not share a '
  'ranking of their own lives.';

comment on column public.profiles.tracking_started_on is
  'First date this user tracked anything. Windows earlier than this render as "before you '
  'started tracking" rather than as zero -- a missing measurement is not a measurement of '
  'zero.';
