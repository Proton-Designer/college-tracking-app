-- Per-dimension Hell, and the drift triggers that surface it (D50).
--
-- The source module pairs a 10-year vision with a 10-year "Hell" you are running from, and its
-- mechanism for using that is shame. This is the same structure with the shame removed, and the
-- removal is structural rather than editorial -- four properties of this schema are what make it
-- safe, and each one is load-bearing:
--
--  1. THERE IS NO SCORE. No heaven/hell slider, no scale, no column that could hold one. That
--     would be the grand total D34 refuses, wearing a darker coat.
--  2. THE APP NEVER WRITES THE TEXT. `dimensions.drift_statement` holds the USER'S own words and
--     nothing generates, rewrites or summarises it. A confrontation shows what they wrote; the app
--     supplies the timing and nothing else.
--  3. IT CAN BE DECLINED. `drift_alerts_enabled` per dimension, one tap, permanent. A mechanic
--     this sharp that cannot be turned off is not a tool.
--  4. EVERY CONFRONTATION IS FOLLOWED BY A DOOR. Enforced in the surface, recorded here:
--     `drift_events.responded_with` cannot be null forever -- the UI offers "start an Hour now" or
--     "crown it for tomorrow", and the response is logged so the pattern is visible later.
--
-- The rate limit is the fifth property and lives in packages/core, because it is a judgement about
-- frequency rather than a fact about storage.

-- ============================================================================
-- 1. The second written field
-- ============================================================================

alter table public.dimensions
  -- Who I become in ten years if this dimension keeps being neglected. First person, present
  -- tense, the user's own words. Nullable: a dimension is complete without one, and prompting for
  -- it is an offer rather than a requirement.
  add column drift_statement text,
  -- Per-dimension opt-out. Defaults TRUE, which is a real choice and not an oversight: a written
  -- drift statement is itself the opt-in -- nothing fires for a dimension that has none.
  add column drift_alerts_enabled boolean not null default true;

comment on column public.dimensions.drift_statement is
  'The user''s own words for who they become if this dimension keeps being neglected. Never '
  'generated, never rewritten, never summarised by the app -- a confrontation quotes this '
  'verbatim and adds nothing (D50).';

-- ============================================================================
-- 2. What fired, when, and what happened next
-- ============================================================================

-- The triggers, all reading data that already exists. Named as an enum so a surface can explain
-- WHICH pattern fired -- "an Hour ended with 9 distractions" is a fact the user can check, and an
-- unexplained confrontation would be the app asserting something about them.
create type public.drift_trigger as enum (
  'distracted_hour',      -- an Hour whose distraction count passed the threshold
  'abandoned_hour',       -- an Hour abandoned with no deliverable produced
  'dimension_dormant',    -- no acts routed to this dimension in N days
  'mit_recrowned',        -- an MIT crowned three nights running and never done
  'day_under_baseline'    -- a day closed below its own weekday baseline
);

-- What the person did with it. `dismissed` is a first-class outcome and is NOT a failure: someone
-- who reads their own words and decides tonight is not the night has used the feature correctly.
create type public.drift_response as enum ('started_hour', 'crowned_tomorrow', 'dismissed');

create table public.drift_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  dimension_id bigint not null references public.dimensions (id) on delete cascade,
  trigger public.drift_trigger not null,
  local_date date not null,
  -- The specific fact behind this firing, for the one line that names it: {"distractions": 9,
  -- "sessionId": 412}. Shown to the user, so it must be checkable rather than atmospheric.
  evidence jsonb not null default '{}'::jsonb,
  shown_at timestamptz not null default now(),
  responded_with public.drift_response,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint drift_events_response_paired
    check ((responded_with is null) = (responded_at is null))
);

-- The index the rate limiter reads: "when did anything last fire for this user".
create index drift_events_user_shown_idx on public.drift_events (user_id, shown_at desc);
create index drift_events_dimension_idx on public.drift_events (dimension_id, shown_at desc);

alter table public.drift_events enable row level security;
alter table public.drift_events force row level security;

create policy drift_events_all_own on public.drift_events
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.drift_events is
  'One row per confrontation actually shown. Append-in-practice: rows are written when shown and '
  'updated once with the response. The log exists so rarity is auditable -- the rate limit is a '
  'promise, and a promise nobody can check is a hope.';

-- ============================================================================
-- 3. Enemy joins the Cards library
-- ============================================================================

-- M14's vocabulary rule again: `cards` is the End-of-Hour rotation, `lesson_cards` is Learn. This
-- is the rotation, so what you are running FROM can appear beside what you are running toward.
alter type public.card_type add value if not exists 'enemy';
