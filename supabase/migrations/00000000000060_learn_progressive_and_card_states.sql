-- The ULM port, schema half. docs/IHSAN_ADDENDUM.md §1, decisions D45/D46/D47.
--
-- Four things, in dependency order:
--
--   1. Card suspension, so an ARCHIVED lesson stops being served without losing a row anyone
--      may already have reviewed (ULM ADR-010).
--   2. Item-level ingestion progress, so a long single-stage phase is distinguishable from a
--      hung job -- to the user AND to us.
--   3. `card_states`: FSRS state, stored (D47).
--   4. `submit_learn_review`: one transaction that appends the review AND advances the state,
--      so the log and the state can never disagree.
--
-- The two ENUM halves of this change (`source_status` gaining 'partial', `lessons.active`
-- becoming `lessons.status`) are in migration 54, edited in place -- see that file's header for
-- why they cannot live here.
--
-- WHAT DID NOT COME ACROSS, and deliberately: ULM's `submit_review` raises bare exception
-- MESSAGES, which its own client then string-matches to decide whether a queued offline review
-- is permanently dead or worth retrying. Both files carry mirror comments calling that coupling
-- fragile and both defer the fix. Every raise below carries an explicit SQLSTATE in the private
-- class `LR` instead, and `packages/api/src/data/errors.ts` already reads `error.code` and never
-- `error.message` -- so the coupling this schema creates is to a five-character code that is part
-- of the contract, not to English prose that a later reviewer will reasonably reword.

-- ============================================================================
-- 1. Card suspension on lesson archive
-- ============================================================================

-- `active` and `suspended_at` are deliberately separate flags with separate owners, not one
-- flag with two writers: `active` is the USER retiring a card, `suspended_at` is the SYSTEM
-- withdrawing one because its lesson was archived. Collapsing them would mean the merge pass
-- silently overwrites a user's own choice, and un-archiving later would have no way to tell
-- whose decision it was restoring. A card is servable only when both agree.
alter table public.lesson_cards add column suspended_at timestamptz;

create index lesson_cards_servable_idx
  on public.lesson_cards (user_id)
  where active and suspended_at is null;

comment on column public.lesson_cards.suspended_at is
  'Set by trigger when the card''s lesson is archived. The system''s withdrawal, distinct from '
  '`active` which is the user''s. Never deleted -- a review may already reference this card.';

-- A TRIGGER, not application code in the merge step, so a lesson archived by ANY path -- the
-- ingestion merge pass, a future moderation tool, a hand-run UPDATE during an incident -- can
-- never leave a stale reviewable card behind. ULM's `suspend_cards_on_lesson_archive`, ported
-- with its one-directional rule intact: un-archiving is not a supported flow, so this does not
-- un-suspend on archived -> active. If un-archiving is ever built it needs its own ruling about
-- whose suspension it is lifting (see the `active`/`suspended_at` note above), and inferring
-- that here would be guessing.
create function public.suspend_cards_on_lesson_archive()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status = 'archived' and old.status is distinct from 'archived' then
    update public.lesson_cards
      set suspended_at = now()
      where lesson_id = new.id and suspended_at is null;
  end if;
  return new;
end;
$$;

create trigger lessons_suspend_cards_on_archive
  after update of status on public.lessons
  for each row execute function public.suspend_cards_on_lesson_archive();

-- ============================================================================
-- 2. Item-level ingestion progress
-- ============================================================================

-- ULM's L2 §1, and the evidence behind it is theirs and measured, not hypothetical: a timed
-- 300-page run sat at one stage for the final ~13 minutes of a 57-minute ingestion while
-- healthily generating cards. A live job and a hung job were indistinguishable from the outside
-- for that whole window -- to the user watching a progress bar, and to the operator reading the
-- table.
--
-- Scoped to the CURRENT step's own natural unit of work (pages during extracting_text, chunks
-- during embedding and extracting_lessons, candidates during merging, surviving lessons during
-- generating_cards -- which is the step ULM's own 13-minute silent window above was in), reset at each step
-- transition rather than accumulated across steps. Nullable because they are meaningless outside
-- an active step: 'queued', 'done' and 'failed' carry no denominator, and inventing one would be
-- the same lie as a progress bar that reaches 90% and waits.
alter table public.ingest_jobs
  add column progress_current integer,
  add column progress_total integer,
  add constraint ingest_jobs_progress_current_nonneg
    check (progress_current is null or progress_current >= 0),
  add constraint ingest_jobs_progress_total_nonneg
    check (progress_total is null or progress_total >= 0);

comment on column public.ingest_jobs.progress_current is
  'Items finished within the CURRENT step, reset at every step transition -- never a global '
  'percentage. Null outside an active step. Exists because a stage-level indicator cannot '
  'distinguish a long step from a hung one.';

-- ============================================================================
-- 3. card_states -- FSRS state, stored (D47)
-- ============================================================================

-- D47 in full: ULM wins on the read path, we keep our integrity property.
--
-- Our original design derived every card's schedule by replaying `lesson_reviews` on every read,
-- with a 2,000-review ceiling that SILENTLY TRUNCATED -- a wrong-but-plausible due count rather
-- than an error, which is worse than either. This table is the fast read path. `scheduleFromLog`
-- stays in packages/core as the ORACLE, and a test proves a stored row equals a replay of the
-- same log; the append-only review log remains the system of record, and this table remains
-- reconstructible from it.
--
-- PK is (card_id, user_id) even though `lesson_cards` is already user-scoped, matching ULM: the
-- composite key is what makes "one state per person per card" a structural fact rather than a
-- convention, and it is the key any future shared-deck feature would need. It is not a licence
-- to share decks -- C9's single-owner RLS still holds below.
create type public.fsrs_card_state as enum ('new', 'learning', 'review', 'relearning');

create table public.card_states (
  card_id bigint not null references public.lesson_cards (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Memory stability in days, and difficulty on FSRS's 1-10 scale. `real`, matching ULM and
  -- ts-fsrs's own precision: these are model parameters, not money.
  stability real,
  difficulty real,
  due_at timestamptz,
  reps integer not null default 0 check (reps >= 0),
  lapses integer not null default 0 check (lapses >= 0),
  state public.fsrs_card_state not null default 'new',
  -- The position within FSRS-5's learning/relearning step ladder.
  --
  -- THIS COLUMN IS NOT IN ULM'S `card_states`, and its absence there is a real defect our oracle
  -- test found before this migration was written. ts-fsrs 5.x carries `learning_steps` on the
  -- card and uses it to decide the next interval while a card is inside the learning or
  -- relearning phase. Reconstructing a card from stability/difficulty/due/reps/lapses/state/
  -- last_review alone loses it, and a card reviewed several times inside the learning phase then
  -- lands in a DIFFERENT state and lapse count than a replay of the identical log produces.
  -- Measured, on a ten-review sequence at six different review spacings: every spacing diverged
  -- (state 'learning' vs 'review', lapses 0 vs 1) without this column and every one matched with
  -- it. Both repos pin ts-fsrs ^5.4.1, so this is not a version difference.
  learning_steps smallint not null default 0 check (learning_steps >= 0),
  last_review_at timestamptz,
  -- The enum, not ULM's smallint. `fsrs_rating` already exists (migration 54) and `lesson_reviews`
  -- stores it; two spellings of one grade in one schema is how they drift.
  last_rating public.fsrs_rating,
  updated_at timestamptz not null default now(),
  primary key (card_id, user_id),
  -- A card that has never been reviewed has no schedule; one that has, has all of it. Stated as a
  -- constraint because "state = 'new' but due_at is set" is the shape a half-applied write leaves
  -- behind, and it would quietly enter the due queue.
  constraint card_states_new_has_no_schedule check (
    (state = 'new') = (last_review_at is null)
  ),
  constraint card_states_reviewed_has_schedule check (
    last_review_at is null
    or (due_at is not null and stability is not null and difficulty is not null and reps > 0)
  )
);

-- The due queue's whole query: one user, ordered by when a card ripens. Partial on non-new rows
-- because a new card has no `due_at` at all and would only pad the index.
create index card_states_due_queue_idx
  on public.card_states (user_id, due_at)
  where state <> 'new';

create trigger card_states_set_updated_at
  before update on public.card_states
  for each row execute function public.set_updated_at();

alter table public.card_states enable row level security;
alter table public.card_states force row level security;

create policy card_states_all_own on public.card_states
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.card_states is
  'Stored FSRS state per (card, user). D47: the fast read path, with `lesson_reviews` still the '
  'append-only system of record and packages/core''s scheduleFromLog kept as the oracle that '
  'proves this table equals a replay of that log.';

-- Every card gets its state row at birth, by trigger, so "a servable card always has a state"
-- is structural rather than a rule each writer has to remember. The pipeline inserts cards as
-- service_role and the user inserts them as themselves; both paths land here.
--
-- Note what this trigger does NOT do: it does not derive `user_id` from `auth.uid()`. The
-- addendum §1.4 records ULM's `BEFORE INSERT` triggers that did exactly that, which makes the
-- table's own `WITH CHECK` trivially true and provides zero real protection. This one copies the
-- owner from the card row, which was itself written with an explicit, policy-checked `user_id`.
create function public.seed_card_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.card_states (card_id, user_id)
  values (new.id, new.user_id)
  on conflict (card_id, user_id) do nothing;
  return new;
end;
$$;

create trigger lesson_cards_seed_card_state
  after insert on public.lesson_cards
  for each row execute function public.seed_card_state();

-- ============================================================================
-- 4. submit_learn_review -- the integrity gate
-- ============================================================================

-- One transaction: append the review, advance the state. The FSRS arithmetic itself runs in
-- packages/core (ts-fsrs, the reference implementation the brief forbids hand-rolling), so this
-- function's job is not to compute the transition but to REFUSE an impossible one. Every check
-- below is a shape a buggy or replayed client could otherwise write, after which the stored state
-- and the log would disagree and nothing would ever notice.
--
-- `p_reviewed_at` rather than `now()` for the log timestamp, and this is load-bearing for D47:
-- the client computed `p_next_state` at a specific instant, and a replay recomputes it from the
-- instant in the log. If the two differ -- by clock skew, by network latency, by anything -- the
-- replay produces a different `due_at` than the row stores, and the oracle test that is supposed
-- to prove they agree instead measures the gap between two clocks. Storing the same instant that
-- produced the state is what makes "stored state equals a replay of this log" a checkable claim.
-- It is bounded below by the previous review (the log must be monotonic per card, or a replay is
-- not even well defined) and above by `now()` (a client cannot schedule its own future).
--
-- `lapses` is VALIDATED, not derived, and that is a deliberate departure from ULM. Theirs
-- computes `lapses = prev.lapses + 1 when rating = 1`, which disagrees with ts-fsrs: the library
-- counts a lapse only for Again in the REVIEW state, never for Again inside learning or
-- relearning. Deriving it here would make the stored count drift from any replay for exactly the
-- cards a struggling user generates most of. So the caller supplies it and this function bounds
-- it: unchanged, or one higher and only on 'again'.
--
-- SQLSTATE, not message text. Class `LR` is unassigned by Postgres (Appendix A) and is ours.
-- PostgREST maps unknown classes to HTTP 500 while still returning the code as `error.code`,
-- which is what `mapDataError` reads -- so the classification survives, and the status is the
-- honest one anyway: every raise below means the client sent a state that cannot be right.
--
--   LR001  no authenticated caller
--   LR002  rating missing
--   LR003  no card_states row for this card and caller
--   LR004  reps did not increase by exactly one
--   LR005  stability not positive
--   LR006  due_at not in the future
--   LR007  next state missing
--   LR008  illegal transition out of 'new'
--   LR009  learning_steps missing or negative
--   LR010  lapses moved illegally
--   LR011  reviewed_at outside (previous review, now]
create function public.submit_learn_review(
  p_card_id bigint,
  p_rating public.fsrs_rating,
  p_local_date date,
  p_reviewed_at timestamptz,
  p_next_state jsonb,
  p_session_id bigint default null,
  p_elapsed_ms integer default null,
  p_answered_text text default null,
  p_ai_feedback text default null
)
returns public.lesson_reviews
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_prev public.card_states;
  v_reps integer;
  v_stability real;
  v_difficulty real;
  v_due_at timestamptz;
  v_state public.fsrs_card_state;
  v_learning_steps smallint;
  v_lapses integer;
  v_inserted public.lesson_reviews;
begin
  if v_caller is null then
    raise exception 'submit_learn_review: no authenticated caller' using errcode = 'LR001';
  end if;
  if p_rating is null then
    raise exception 'submit_learn_review: rating is required' using errcode = 'LR002';
  end if;

  -- FOR UPDATE: two devices submitting the same card concurrently must serialise, or both read
  -- the same `prev.reps` and the second one's reps check passes against a state that is already
  -- gone.
  select * into v_prev
    from public.card_states
    where card_id = p_card_id and user_id = v_caller
    for update;

  if not found then
    raise exception 'submit_learn_review: no card_states row for card % and caller', p_card_id
      using errcode = 'LR003';
  end if;

  v_reps           := (p_next_state->>'reps')::integer;
  v_stability      := (p_next_state->>'stability')::real;
  v_difficulty     := (p_next_state->>'difficulty')::real;
  v_due_at         := (p_next_state->>'due_at')::timestamptz;
  v_state          := (p_next_state->>'state')::public.fsrs_card_state;
  v_learning_steps := (p_next_state->>'learning_steps')::smallint;
  v_lapses         := (p_next_state->>'lapses')::integer;

  if v_state is null then
    raise exception 'submit_learn_review: next state is required' using errcode = 'LR007';
  end if;
  if v_state = 'new' then
    raise exception 'submit_learn_review: a reviewed card cannot return to new'
      using errcode = 'LR008';
  end if;
  if v_prev.state = 'new' and v_state not in ('learning', 'review') then
    raise exception 'submit_learn_review: illegal transition new -> %', v_state
      using errcode = 'LR008';
  end if;
  if v_reps is null or v_reps <> v_prev.reps + 1 then
    raise exception 'submit_learn_review: reps must increase by exactly 1 (was %, proposed %)',
      v_prev.reps, v_reps using errcode = 'LR004';
  end if;
  if v_stability is null or v_stability <= 0 then
    raise exception 'submit_learn_review: stability must be > 0 (proposed %)', v_stability
      using errcode = 'LR005';
  end if;
  if v_difficulty is null then
    raise exception 'submit_learn_review: difficulty is required' using errcode = 'LR005';
  end if;
  if v_due_at is null or v_due_at <= now() then
    raise exception 'submit_learn_review: due_at must be in the future (proposed %)', v_due_at
      using errcode = 'LR006';
  end if;
  if v_learning_steps is null or v_learning_steps < 0 then
    raise exception 'submit_learn_review: learning_steps must be >= 0 (proposed %)', v_learning_steps
      using errcode = 'LR009';
  end if;
  if v_lapses is null
     or v_lapses < v_prev.lapses
     or v_lapses > v_prev.lapses + 1
     or (v_lapses = v_prev.lapses + 1 and p_rating <> 'again') then
    raise exception 'submit_learn_review: lapses moved illegally (was %, proposed %, rating %)',
      v_prev.lapses, v_lapses, p_rating using errcode = 'LR010';
  end if;
  if p_reviewed_at is null
     or p_reviewed_at > now()
     or (v_prev.last_review_at is not null and p_reviewed_at <= v_prev.last_review_at) then
    raise exception
      'submit_learn_review: reviewed_at must be after the previous review (%) and not in the future',
      v_prev.last_review_at using errcode = 'LR011';
  end if;

  insert into public.lesson_reviews (
    user_id, card_id, session_id, rating, elapsed_ms, answered_text, ai_feedback,
    reviewed_at, local_date
  ) values (
    v_caller, p_card_id, p_session_id, p_rating, p_elapsed_ms, p_answered_text, p_ai_feedback,
    p_reviewed_at, p_local_date
  ) returning * into v_inserted;

  update public.card_states set
    stability = v_stability,
    difficulty = v_difficulty,
    due_at = v_due_at,
    reps = v_reps,
    lapses = v_lapses,
    state = v_state,
    learning_steps = v_learning_steps,
    last_review_at = p_reviewed_at,
    last_rating = p_rating
  where card_id = p_card_id and user_id = v_caller;

  return v_inserted;
end;
$$;

comment on function public.submit_learn_review is
  'Appends one review and advances its card_states row in ONE transaction, so the append-only log '
  'and the stored FSRS state can never disagree (D47). Validates the proposed transition rather '
  'than trusting it; raises with SQLSTATE class LR rather than message text, deliberately -- see '
  'the migration header.';

-- Migration 18's grant discipline: revoke from PUBLIC and anon, then grant only where there is a
-- real reason. `authenticated` alone, and not `service_role` as the wrappers in 18 do -- this
-- function is SECURITY INVOKER and keys everything off `auth.uid()`, so a service_role caller
-- would land on LR001 rather than doing anything useful. Granting it would advertise a capability
-- that does not exist.
revoke execute on function public.submit_learn_review(
  bigint, public.fsrs_rating, date, timestamptz, jsonb, bigint, integer, text, text
) from PUBLIC, anon;
grant execute on function public.submit_learn_review(
  bigint, public.fsrs_rating, date, timestamptz, jsonb, bigint, integer, text, text
) to authenticated;
