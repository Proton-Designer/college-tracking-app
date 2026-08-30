-- Desired Self -- the destination the rest of the app serves.
--
-- New work with no prior art in any of the three apps, but it lands on machinery that already
-- exists, deliberately: the scoring model is the habits precedent (a derived decaying score,
-- replayed from a log, never stored), and the knowing-to-doing bridge is the `experiments` engine
-- rather than a second trial mechanism.
--
-- **The integrity constraint, stated as schema.** There is NO points column anywhere in this
-- migration, and there never may be. A dimension's standing is computed from the source rows that
-- fed it -- sessions, habit logs, prayers, reviews, sets, milestones -- so tapping a dimension
-- necessarily shows the acts behind it. "Points are evidence, not currency" is not a UI promise
-- here; it is a property of a schema that has nowhere to put a currency. The same structural move
-- D10 makes for academic data: the unsafe thing has no write path at all.
--
-- D34: scoring is per dimension. There is no global total and no table that could hold one.

-- ============================================================================
-- 1. Dimensions
-- ============================================================================

create table public.dimensions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  -- Traits live UNDER Traits as sub-dimensions (wit, charisma, courage, patience...), which is
  -- what parent_id is for. One level of nesting is all the model needs; deeper would be a taxonomy
  -- nobody asked for.
  parent_id bigint references public.dimensions (id) on delete cascade,
  -- The user's own written definition of the aimed-at version. Free text and required-in-spirit:
  -- a dimension without one is a label, and the whole framing is that you name what you are aiming
  -- at. Nullable in the schema so it can be filled in after creation rather than blocking the
  -- create.
  definition text,
  -- The overshoot ceiling, in whatever unit the routing map counts for this dimension. NULL means
  -- this dimension cannot be overshot, which is the default and the honest state for most of them
  -- (D35: arrogance is not machine-detectable; only user-set, objective ceilings fire).
  ceiling numeric(8, 2) check (ceiling is null or ceiling > 0),
  sort_order smallint not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint dimensions_name_not_blank check (btrim(name) <> ''),
  constraint dimensions_name_unique_per_user unique (user_id, name),
  -- A dimension cannot be its own parent. Deeper cycles are prevented by the app; this catches the
  -- one case a single statement can create.
  constraint dimensions_not_own_parent check (parent_id is null or parent_id <> id)
);

create index dimensions_user_idx on public.dimensions (user_id, archived, sort_order);
create index dimensions_parent_idx on public.dimensions (parent_id);

create trigger dimensions_set_updated_at
  before update on public.dimensions
  for each row execute function public.set_updated_at();

alter table public.dimensions enable row level security;
alter table public.dimensions force row level security;

create policy dimensions_all_own on public.dimensions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- D39/D40: NOT seeded. The directive names Physique, Deen, Work/Craft, Focus and Traits as the
-- starting structure, and the onboarding flow offers exactly those as one-tap suggestions -- but
-- three people use this app and none of them should open Self to find a set of virtues someone
-- else chose, already scored. An empty Self that explains what a dimension is for is the honest
-- first run.
comment on table public.dimensions is
  'Desired Self dimensions, user-extensible; Traits'' sub-dimensions hang off parent_id. '
  'Deliberately NOT seeded -- the suggested five are offered in onboarding, never inserted for '
  'someone (D39, D40). There is no points column here or anywhere: standing is derived from the '
  'acts that fed it, so a score can never become the thing being optimised.';

-- ============================================================================
-- 2. Routing -- what makes this one system rather than five trackers
-- ============================================================================

-- Every action in the app declares which dimension it serves, and this is where that declaration
-- lives. As DATA rather than as switch statements scattered across surfaces: a routing rule the
-- user can see and change is inspectable, and a hardcoded one is a hidden opinion about whose
-- Business Hours count as Work/Craft.
create type public.evidence_kind as enum (
  'session',        -- a task_sessions row, matched by domain
  'habit_log',      -- a habit_logs vote
  'prayer',         -- a prayers row logged on_time or qada
  'quran_session',
  'workout_set',    -- confirmed session_sets
  'body_metric',
  'lesson_review',  -- a completed Learn review, routed by its source's topic
  'milestone',      -- a War Map milestone completed
  'experiment'      -- a claim_to_task trial -- the knowing-to-doing bridge landing
);

create table public.dimension_routes (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  dimension_id bigint not null references public.dimensions (id) on delete cascade,
  kind public.evidence_kind not null,
  -- Narrows the kind. For 'session' this is the life_domain; for 'lesson_review' the source id;
  -- for 'habit_log' the habit id. Text because the discriminator's type varies by kind, and a
  -- column per kind would be nine nullable columns of which eight are always null.
  match_value text,
  -- Relative contribution of one act of this kind. Not a score and not currency -- it is how much
  -- one workout counts against one prayer WITHIN a single dimension, which is a judgement the user
  -- owns. Cross-dimension comparison is not expressible here, by design (D34).
  weight numeric(4, 2) not null default 1 check (weight > 0),
  created_at timestamptz not null default now(),
  constraint dimension_routes_unique unique (user_id, dimension_id, kind, match_value)
);

create index dimension_routes_user_idx on public.dimension_routes (user_id, kind);

alter table public.dimension_routes enable row level security;
alter table public.dimension_routes force row level security;

create policy dimension_routes_all_own on public.dimension_routes
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.dimension_routes is
  'Which acts feed which dimension. Data, not code: a routing rule the user can see and change is '
  'inspectable, and a hardcoded one is a hidden opinion about what someone''s life is for.';

-- ============================================================================
-- 3. The bridge to Learn
-- ============================================================================

-- ULM's claim_to_task proposes a behaviour; trying it is an `experiments` row; the trial feeds the
-- dimension its source serves. This column is the one link that chain was missing -- it does not
-- duplicate the experiment machinery, it just records where a trial came from.
alter table public.experiments
  add column lesson_id bigint references public.lessons (id) on delete set null;

create index experiments_lesson_idx on public.experiments (lesson_id);

comment on column public.experiments.lesson_id is
  'Set when this experiment was proposed by a lesson''s claim_to_task. The knowing-to-doing bridge '
  'the research report identifies as the market gap: a lesson proposes a behaviour, the behaviour '
  'is tried here, and the trial feeds the dimension it serves.';
