-- D27 -- one session primitive. The merge directive's rule 3.1 (Hour = Lock-In = ULM
-- daily session) is implemented as two columns on the table C1 already chose, not as a
-- new table.
--
-- Why extend rather than add: the hard parts of this table were expensive to get right
-- and are now load-bearing for three more consumers -- resumability from a wall-clock
-- timestamp, the DB-enforced one-active-session-per-user, and the
-- active/completed/abandoned distinction duration calibration depends on. A second
-- session table would give the Wall, Insights, Signal:Noise and Desired Self two
-- different answers to "what did I do today", which is the two-sources-of-truth failure
-- C4 refused for due dates and check:core-mirror exists to prevent in the domain engine.
--
-- Blast radius, acknowledged rather than discovered: calibration, friction analytics,
-- DayTrace, the Wall, Efficiency and Day Won all read this table. Both columns are
-- additive with defaults and no existing query changes meaning.

-- ============================================================================
-- 1. The two closed sets
-- ============================================================================

-- ENUM per migration 0002's policy: a closed set we control, mirroring a packages/core
-- union, fixed by the directive rather than accumulated by users. Contrast
-- task_sessions.category, which is free text precisely because the set a user
-- accumulates there is personal and open-ended -- these five are not.
create type public.life_domain as enum (
  'deen',
  'business',
  'school',
  'fitness',
  'work'
);

create type public.session_type as enum (
  -- CollegeOS's Hour and LifeOS's two Lock-In kinds, reconciled: the distinction Ayman
  -- draws between producing and absorbing is real and survives as a type.
  'deep_work',
  'deep_study',
  -- The ULM daily retention session. Short by design (5-10 min) -- see D28 for why that
  -- makes it a session but not an Hour.
  'learn',
  -- The Monday anti-worry Hour, which already exists as a product concept with no way to
  -- name itself in data.
  'anti_worry',
  'exam_prep'
);

-- ============================================================================
-- 2. The columns
-- ============================================================================

alter table public.task_sessions
  add column session_type public.session_type not null default 'deep_work',
  add column domain public.life_domain not null default 'school';

-- ----------------------------------------------------------------------------
-- Backfill. Explicit, and stated as the claim it is.
-- ----------------------------------------------------------------------------
-- Every row predating this migration was created by the academic product, so 'school' is
-- the honest default for the bulk of them. Where an Hour carried a category the user
-- typed, that is better evidence than the default and is used instead -- best-effort,
-- lower-cased, and only for names whose meaning is unambiguous. The category column is
-- untouched and keeps the finer-grained truth for anyone who wants to re-derive later.
--
-- Deliberately NOT guessed: anything unrecognised stays 'school' rather than being
-- assigned a domain on a hunch. D7's rule applied to a backfill -- a fabricated
-- observation is worse than a stated default.
update public.task_sessions
set domain = case
  when lower(btrim(coalesce(category, ''))) in ('school', 'academics', 'study', 'class') then 'school'
  when lower(btrim(coalesce(category, ''))) in ('myhomebase', 'business', 'content', 'systems') then 'business'
  when lower(btrim(coalesce(category, ''))) in ('fitness', 'gym', 'training', 'workout') then 'fitness'
  when lower(btrim(coalesce(category, ''))) in ('deen', 'quran', 'qur''an', 'islam') then 'deen'
  when lower(btrim(coalesce(category, ''))) in ('work', 'shift', 'job', 'admin') then 'work'
  else 'school'
end::public.life_domain;

-- session_type needs no CASE: 'deep_work' is not a default standing in for missing
-- information, it is what every pre-merge row actually was. deep_study/learn/anti_worry/
-- exam_prep had no way to be created before this migration.

-- ----------------------------------------------------------------------------
-- D28 made structural: an Hour is a deep session.
-- ----------------------------------------------------------------------------
-- Storage identity is not metrics identity. One table (D27) does not mean one metric:
-- hour_index is what makes a row count toward Day Won, the per-weekday baselines, Delta
-- and Efficiency, and a 7-minute Learn session must never inflate a number the user
-- calibrated their baselines against. packages/core owns the read-side predicate
-- (countsTowardHours); this constraint makes the write side unable to disagree with it.
alter table public.task_sessions
  add constraint task_sessions_hour_index_is_deep
    check (
      hour_index is null
      or session_type in ('deep_work', 'deep_study', 'exam_prep')
    );

-- ============================================================================
-- 3. Read paths this creates
-- ============================================================================

-- Every domain page is a filtered view over shared primitives (directive rule 3.4), so
-- (user, domain, local_date) is the shape those reads take.
create index task_sessions_user_domain_date_idx
  on public.task_sessions (user_id, domain, local_date);

comment on column public.task_sessions.session_type is
  'What kind of session this is. Hours (hour_index not null) are constrained to the deep '
  'types -- see D28: a Learn session is a real session and belongs on the Wall and in '
  'Signal coverage, but must not count toward Day Won.';

comment on column public.task_sessions.domain is
  'Which of the five life domains this session served. Required so no write path can '
  'create an untagged session; rows predating the merge were backfilled from category '
  'where it was unambiguous and to ''school'' otherwise.';
