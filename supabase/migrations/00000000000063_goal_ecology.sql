-- Goal Ecology (D49) -- the relationships between goals, and an optional gate on what becomes one.
--
-- The idea the source module gets right: goals are usually treated as a list, and a list cannot
-- express the thing that actually kills systems, which is two goals quietly working against each
-- other. "Wake at 5am for deep work" and "network four nights a week" are each reasonable and
-- jointly impossible, and nothing in Ihsan notices that today.
--
-- The idea it gets wrong: it tells you to ELIMINATE competing goals. Sometimes two goals genuinely
-- compete and both matter, and the useful thing an app can do is make the tension visible so the
-- trade-off is chosen rather than discovered in six weeks. So this schema surfaces; it does not
-- prescribe, and there is no column anywhere that ranks one goal above another.

-- ============================================================================
-- 1. The pair relationships
-- ============================================================================

create type public.goal_relationship as enum (
  'competing',    -- progress on one costs progress on the other
  'neutral',      -- they do not conflict, but they do compete for the same hours
  'synergistic'   -- progress on one accelerates the other
);

create table public.goal_relationships (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Unordered pair, stored ordered. `goal_a_id < goal_b_id` is enforced below so the unique
  -- constraint actually means "one row per pair" -- without it (A,B) and (B,A) are two rows and
  -- the two could disagree about the same relationship.
  goal_a_id bigint not null references public.goals (id) on delete cascade,
  goal_b_id bigint not null references public.goals (id) on delete cascade,
  relationship public.goal_relationship not null,
  -- The user's own sentence about WHY, in their words. This is the part they reread in ninety
  -- days, and it is what makes a competing pair actionable rather than merely flagged.
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_relationships_ordered check (goal_a_id < goal_b_id),
  constraint goal_relationships_one_per_pair unique (user_id, goal_a_id, goal_b_id)
);

create index goal_relationships_user_idx on public.goal_relationships (user_id, relationship);

create trigger goal_relationships_set_updated_at
  before update on public.goal_relationships
  for each row execute function public.set_updated_at();

alter table public.goal_relationships enable row level security;
alter table public.goal_relationships force row level security;

create policy goal_relationships_all_own on public.goal_relationships
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- D49's rule, stated where someone will read it before adding a default: an UNMARKED pair has no
-- row. It is NOT 'neutral'. Neutral is a judgement the user made; unmarked is a question not yet
-- asked, and a default would inflate how examined someone's goals are -- the same
-- real-zero-is-not-absent rule the rest of the engine follows.
comment on table public.goal_relationships is
  'One row per marked pair of goals. An unmarked pair has NO ROW and must never be treated as '
  'neutral -- neutral is an answer, unmarked is an unasked question (D49).';

-- ============================================================================
-- 2. The Priority Matrix -- optional, by design
-- ============================================================================

-- Four 1-5 scores on a goal. OPTIONAL: a required scoring ritual on every goal is friction that
-- gets skipped, and a skipped ritual teaches people to ignore the app. A goal with no scores is a
-- goal nobody has evaluated yet, which is a fact worth being able to see.
create table public.goal_priority_scores (
  goal_id bigint primary key references public.goals (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- How directly this advances the 10-year vision.
  vision_alignment smallint not null check (vision_alignment between 1 and 5),
  -- Impact per unit of time invested.
  leverage smallint not null check (leverage between 1 and 5),
  -- Whether the benefit compounds or is a one-time gain.
  compound_benefit smallint not null check (compound_benefit between 1 and 5),
  -- What is NOT being done if this is chosen. Scored inverted at read time -- a HIGH opportunity
  -- cost lowers the total -- and stored as given so the number means what the user typed.
  opportunity_cost smallint not null check (opportunity_cost between 1 and 5),
  scored_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index goal_priority_scores_user_idx on public.goal_priority_scores (user_id);

create trigger goal_priority_scores_set_updated_at
  before update on public.goal_priority_scores
  for each row execute function public.set_updated_at();

alter table public.goal_priority_scores enable row level security;
alter table public.goal_priority_scores force row level security;

create policy goal_priority_scores_all_own on public.goal_priority_scores
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- There is deliberately NO stored total. The composite is derived in packages/core, for the same
-- reason Desired Self stores no points: a stored score becomes the thing people optimise, and a
-- derived one always agrees with the four numbers under it.
comment on table public.goal_priority_scores is
  'The optional Priority Matrix. No stored total -- the composite is derived, so it can never '
  'disagree with the four scores beneath it. A goal with no row here is simply unevaluated.';
