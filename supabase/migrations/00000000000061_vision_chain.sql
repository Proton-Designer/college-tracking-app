-- D48 -- the vision chain. Four layers above the War Map, linked upward by NULLABLE FK.
--
--   10-Year Vision  ->  3-Year Beachhead  ->  1-Year Mission  ->  90-Day M.O.M.
--                         ->  monthly milestones (exists)  ->  Night Plan MIT (exists)
--
-- **Nullable is the ruling, not laziness.** Every FK in this file that points at the layer above
-- is nullable, and `goals.mom_id` / `tasks.mom_id` are nullable too. Forcing an MIT to justify
-- itself upward would make the Night Plan unusable on the ordinary night when something urgent is
-- the honest answer, and would train people to attach a lie. An item that traces to nothing is
-- `unanchored` -- a fact the app can count and name, never a failure state. There is deliberately
-- no NOT NULL, no CHECK and no trigger anywhere below that would make an unanchored row illegal.
--
-- **The structure is taken from the source module; its voice is not.** That document's engine is
-- shame. Nothing here stores a judgement: the M.O.M. is scored on its own terms (hit / partial /
-- missed / **changed**), and `changed` is first-class because a beachhead that turned out to be the
-- wrong beachhead is information rather than failure.
--
-- **Nothing is seeded.** A user with no vision has no row here, and every surface says so and
-- points at the action (D40). There is no default vision, no starter beachhead and no placeholder
-- M.O.M., because a fabricated destination is worse than an empty one.

-- ============================================================================
-- 1. The 10-Year Vision -- one written document, not six tables
-- ============================================================================

-- The source module's six mandates (financial, professional, physical, relational, family,
-- environmental) are SECTIONS OF ONE STATEMENT, and that is how they are stored: one `body` the
-- user writes in their own words, present tense, plus six optional per-mandate columns for the
-- breakdown when they want one.
--
-- Six columns rather than a child table or a jsonb blob: the set is closed and fixed by the source
-- module, so a table would be rows-as-columns with an FK for a list that can never grow, and jsonb
-- would put six known fields behind a schema Postgres cannot check. Every one is nullable -- the
-- breakdown is optional, and a vision written as a single paragraph is a complete vision.
create table public.visions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- The statement itself. Required-in-spirit and required in schema: a vision row with no body is
  -- a row that exists to look like progress, which is exactly what D40 forbids.
  body text not null,
  mandate_financial text,
  mandate_professional text,
  mandate_physical text,
  mandate_relational text,
  mandate_family text,
  mandate_environmental text,
  -- Retired rather than deleted. Refining the wording edits this row; deciding the whole
  -- statement was wrong clears `active` and writes a new one, and the old ten years stay
  -- readable -- the same instinct `trigger_action_plans` follows about superseded plans.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visions_body_not_blank check (btrim(body) <> '')
);

-- One ACTIVE vision per user. Partial, so retired statements accumulate as history rather than
-- being overwritten -- "one active vision" is then a fact the database holds, not a convention the
-- app remembers.
create unique index visions_one_active_per_user on public.visions (user_id) where active;

create trigger visions_set_updated_at
  before update on public.visions
  for each row execute function public.set_updated_at();

alter table public.visions enable row level security;
alter table public.visions force row level security;

create policy visions_all_own on public.visions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.visions is
  'The 10-year statement (D48). One written document; the six mandates are optional sections of '
  'it, not six tables. One active row per user, older ones retired rather than deleted.';

-- ============================================================================
-- 2. Beachhead -> Mission -> M.O.M.
-- ============================================================================

-- The three middle layers are the same shape three times, and are deliberately kept as three
-- tables rather than one `chain_nodes` table with a `layer` enum. A self-referencing generic table
-- would make "a mission's parent must be a beachhead" an application rule instead of an FK, and the
-- one thing this feature must never do is let the chain point somewhere it cannot mean.
--
-- Every one of them:
--   * `title` -- what it is, in the user's words.
--   * `target` -- the optional measurable version. Free text: "$40k saved" and "bench 2 plates"
--     are both targets and neither is a number this schema could type.
--   * `starts_on` / `ends_on` -- the date window, both NULLABLE. A layer with no end date shows no
--     countdown rather than a zero (D40).
--   * a nullable FK to the layer above, `on delete set null` -- retiring a beachhead must not
--     delete the missions that hung under it. They become unanchored, which is a state this
--     feature already knows how to show.

create table public.beachheads (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  vision_id bigint references public.visions (id) on delete set null,
  title text not null,
  target text,
  starts_on date,
  ends_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint beachheads_title_not_blank check (btrim(title) <> ''),
  -- A window that ends before it starts has no meaning; the constraint makes it unrepresentable
  -- rather than something every reader of `ends_on` has to defend against.
  constraint beachheads_window_ordered check (starts_on is null or ends_on is null or ends_on >= starts_on)
);

-- One active per layer, per user. The chain is ONE unbroken line -- two simultaneous three-year
-- beachheads is not a chain, it is a list. History is kept by clearing `active`, never by deleting.
create unique index beachheads_one_active_per_user on public.beachheads (user_id) where active;
create index beachheads_user_idx on public.beachheads (user_id, active, ends_on);
create index beachheads_vision_idx on public.beachheads (vision_id);

create trigger beachheads_set_updated_at
  before update on public.beachheads
  for each row execute function public.set_updated_at();

alter table public.beachheads enable row level security;
alter table public.beachheads force row level security;

create policy beachheads_all_own on public.beachheads
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.missions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  beachhead_id bigint references public.beachheads (id) on delete set null,
  title text not null,
  target text,
  starts_on date,
  ends_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint missions_title_not_blank check (btrim(title) <> ''),
  constraint missions_window_ordered check (starts_on is null or ends_on is null or ends_on >= starts_on)
);

create unique index missions_one_active_per_user on public.missions (user_id) where active;
create index missions_user_idx on public.missions (user_id, active, ends_on);
create index missions_beachhead_idx on public.missions (beachhead_id);

create trigger missions_set_updated_at
  before update on public.missions
  for each row execute function public.set_updated_at();

alter table public.missions enable row level security;
alter table public.missions force row level security;

create policy missions_all_own on public.missions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- The 90-day M.O.M. The bottom of the new chain and the top of the one that already exists:
-- `goals.mom_id` and `tasks.mom_id` below both point here.
create table public.moms (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  mission_id bigint references public.missions (id) on delete set null,
  title text not null,
  target text,
  starts_on date,
  ends_on date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint moms_title_not_blank check (btrim(title) <> ''),
  constraint moms_window_ordered check (starts_on is null or ends_on is null or ends_on >= starts_on)
);

create unique index moms_one_active_per_user on public.moms (user_id) where active;
create index moms_user_idx on public.moms (user_id, active, ends_on);
create index moms_mission_idx on public.moms (mission_id);

create trigger moms_set_updated_at
  before update on public.moms
  for each row execute function public.set_updated_at();

alter table public.moms enable row level security;
alter table public.moms force row level security;

create policy moms_all_own on public.moms
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.moms is
  'The 90-day M.O.M. (D48). Bottom of the new chain: goals.mom_id and tasks.mom_id hang from it, '
  'both nullable. ends_on is nullable, so a M.O.M. without one shows no countdown rather than a '
  'zero.';

-- ============================================================================
-- 3. Hanging the existing War Map and the Night Plan below it
-- ============================================================================

-- `goals` is the store of direction (D37) and the natural child of a M.O.M.
alter table public.goals
  add column mom_id bigint references public.moms (id) on delete set null;

create index goals_mom_idx on public.goals (mom_id);

comment on column public.goals.mom_id is
  'The 90-day M.O.M. this goal steps down from (D48). NULLABLE and stays that way: a goal that '
  'answers to nothing above it is unanchored, which is a fact to count, not an error to prevent.';

-- `tasks` gets its own anchor so an MIT can name what it serves DIRECTLY, without inventing a goal
-- to route through. Both paths are legitimate and the resolver walks the direct one first: some
-- nights the honest answer is "this serves the M.O.M." and there is no War Map goal in between.
alter table public.tasks
  add column mom_id bigint references public.moms (id) on delete set null;

-- Partial: the overwhelming majority of tasks carry no anchor, by design, and an index over a
-- column that is null on most rows should not pay for them.
create index tasks_mom_idx on public.tasks (mom_id) where mom_id is not null;

comment on column public.tasks.mom_id is
  'What this task serves, when the user chose to say (D48). NULLABLE on purpose -- the Night Plan '
  'picker is optional, because a required one would train people to attach a lie.';

-- ============================================================================
-- 4. The 90-day review ritual
-- ============================================================================

-- `changed` sits in the same enum as `hit`, and that placement is the ruling. It is not a softer
-- `missed`: a beachhead that turned out to be the wrong beachhead is information, and a schema that
-- could only record hit/partial/missed would force the user to file learning as failure.
create type public.mom_outcome as enum ('hit', 'partial', 'missed', 'changed');

create table public.mom_reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  mom_id bigint not null references public.moms (id) on delete cascade,
  -- The local day the review was written. Local, never UTC-derived: this product is about local
  -- days, and a review written at 11pm belongs to the day the user is standing in (B4).
  local_date date not null,
  outcome public.mom_outcome not null,
  -- What happened, in the user's own words. The app never writes this and never paraphrases it.
  what_happened text,
  -- The M.O.M. set at the end of the ritual. Nullable: closing one without immediately choosing
  -- the next is a legitimate way to finish -- "I need to think about this" is an honest answer,
  -- and a NOT NULL here would force a made-up next 90 days to close the last ones.
  next_mom_id bigint references public.moms (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One review per M.O.M. It is the closing ritual, not a running log; a second row would make
  -- "was this reviewed" ambiguous exactly where the surface asks it.
  constraint mom_reviews_one_per_mom unique (user_id, mom_id),
  -- A review cannot name itself as what comes next.
  constraint mom_reviews_next_is_not_self check (next_mom_id is null or next_mom_id <> mom_id)
);

create index mom_reviews_user_idx on public.mom_reviews (user_id, local_date desc);

create trigger mom_reviews_set_updated_at
  before update on public.mom_reviews
  for each row execute function public.set_updated_at();

alter table public.mom_reviews enable row level security;
alter table public.mom_reviews force row level security;

create policy mom_reviews_all_own on public.mom_reviews
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.mom_reviews is
  'The 90-day ritual (D48): score the M.O.M., write what happened, set the next one. `changed` is '
  'a first-class outcome alongside `hit`, not a polite `missed`.';
