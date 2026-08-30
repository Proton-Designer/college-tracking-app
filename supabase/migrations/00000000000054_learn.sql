-- The Learn pillar (ULM). Sources in, grounded lessons out, a five-minute daily retention session
-- over them.
--
-- **Scope rule, from the directive and non-negotiable: this is business and self-improvement
-- learning only.** Course knowledge stays in the Question Bank and never mixes in. They study for
-- different reasons -- school knowledge has a deadline and a grade with the exam as its terminal
-- event, this knowledge has no deadline and exists to change who you are -- and interleaving them
-- would make both queues worse. Nothing here references `courses`, and nothing in `questions`
-- references anything here.
--
-- Naming: every table is neutral (`sources`, not `books` and not `ulm_*`). Sources are already more
-- than books, and D43 keeps product names out of identifiers so the cutover rename stays a config
-- diff rather than a code hunt.
--
-- EDITED IN PLACE for the ULM port (docs/IHSAN_ADDENDUM.md §1.3, which rules "migration, not
-- replacement -- our 54 is applied nowhere, so it is edited in place rather than superseded").
-- Two changes live here rather than in migration 60, and both for the same reason: they are
-- ENUM changes, and `alter type ... add value` cannot be used in the same transaction as a
-- statement referencing the new value. ULM needed two migrations to add two enum values for
-- exactly that reason; declaring them at creation costs nothing and keeps migration 60 a single
-- readable transaction.
--
--   * `source_status` gains 'partial'.
--   * `lessons.active` (boolean) becomes `lessons.status` (`lesson_status` enum).
--   * `ingest_step` gains 'generating_cards', between 'merging' and 'done'. Same reason as
--     the two above and the same precedent: the pipeline extracted lessons and then stopped,
--     so `lesson_cards` was never written by anything and `source_status = 'partial'` -- which
--     fires on CARDED lessons -- could never be reached. See the enum's own comment below.
--
-- Everything else from the port -- `lesson_cards.suspended_at`, the archive trigger,
-- `ingest_jobs` item-level progress, `card_states`, `submit_learn_review` -- is additive and
-- lives in migration 60 where it can be read as one change.

-- ============================================================================
-- 1. Sources and their structure
-- ============================================================================

-- PDF first, per the brief. The rest of the enum exists so the vocabulary is stable and the
-- ingestion pipeline can branch on it, but only 'pdf' has a working extractor today -- the same
-- pattern migration 42 used for questions.origin = 'missed'.
create type public.source_kind as enum ('pdf', 'epub', 'article', 'video', 'course');

-- `partial` is ULM's ADR-010 (ported per the addendum §1.1): a source becomes usable BEFORE
-- ingestion finishes, the moment enough of its lessons have cards to draw a real first session
-- from. It sits between 'processing' and 'ready' in meaning, not in the enum's sort order --
-- nothing orders on this type, and adding it here rather than by a later `alter type ... add
-- value` is only possible because migration 54 is applied nowhere yet (see the file header note
-- on migration 60). Postgres forbids using a value added by `alter type` in the same transaction
-- that adds it, which is why ULM needed two migrations for this one word and we need none.
create type public.source_status as enum ('uploaded', 'processing', 'partial', 'ready', 'failed');

create table public.sources (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  author text,
  kind public.source_kind not null default 'pdf',
  -- Path within the private `sources` storage bucket. Null once a source is retained only as its
  -- extracted lessons -- the research report's privacy note argues for short retention of raw
  -- uploads, and dropping the file must not delete the learning.
  storage_path text,
  status public.source_status not null default 'uploaded',
  page_count integer check (page_count is null or page_count > 0),
  -- Denormalised for the library list, which would otherwise count lessons per row on every render.
  lesson_count integer not null default 0 check (lesson_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sources_title_not_blank check (btrim(title) <> '')
);

create index sources_user_status_idx on public.sources (user_id, status);

create trigger sources_set_updated_at
  before update on public.sources
  for each row execute function public.set_updated_at();

alter table public.sources enable row level security;
alter table public.sources force row level security;

create policy sources_all_own on public.sources
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.source_sections (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_id bigint not null references public.sources (id) on delete cascade,
  title text,
  sort_order integer not null default 0,
  page_start integer check (page_start is null or page_start > 0),
  page_end integer check (page_end is null or page_end > 0),
  created_at timestamptz not null default now()
);

create index source_sections_source_idx on public.source_sections (source_id, sort_order);

alter table public.source_sections enable row level security;
alter table public.source_sections force row level security;

create policy source_sections_all_own on public.source_sections
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.source_chunks (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_id bigint not null references public.sources (id) on delete cascade,
  section_id bigint references public.source_sections (id) on delete set null,
  text text not null,
  page_start integer check (page_start is null or page_start > 0),
  page_end integer check (page_end is null or page_end > 0),
  sort_order integer not null default 0,
  -- 1024 dimensions: voyage-3.5-lite's native size, the recommended provider in the plan.
  --
  -- NULLABLE, and that is D41 rather than an oversight. Anthropic ships no embeddings API, so the
  -- vectors come from a second vendor whose key does not exist yet. Ingestion runs to completion
  -- without it: chunks and lessons are stored, the merge pass degrades to lexical similarity, and
  -- this column stays null until the key is supplied and a backfill runs. No code path waits, and
  -- none gets exercised for the first time on the day the key arrives.
  embedding extensions.vector(1024),
  created_at timestamptz not null default now(),
  constraint source_chunks_text_not_blank check (btrim(text) <> '')
);

create index source_chunks_source_idx on public.source_chunks (source_id, sort_order);

-- The ANN index is created but will simply not be used while every embedding is null. Building it
-- now keeps the backfill from needing a schema change on the day the key lands.
create index source_chunks_embedding_idx
  on public.source_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

alter table public.source_chunks enable row level security;
alter table public.source_chunks force row level security;

create policy source_chunks_all_own on public.source_chunks
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- 2. Lessons -- the atomic unit
-- ============================================================================

create type public.evidence_strength as enum ('author_anecdote', 'single_study', 'strong_research');

-- The lesson lifecycle, ported from ULM's ADR-010 and replacing the boolean `active` this
-- migration originally carried.
--
--   provisional -- written as its chunk clears the provenance gate, before the whole-source merge
--                  has run. Readable, and the only status a lesson has while its source is still
--                  ingesting.
--   active      -- promoted by the merge pass. The set a session draws from.
--   archived    -- lost a dedup contest, or was retired by the user.
--
-- **Losers are ARCHIVED, NEVER DELETED**, and that is the whole point of the enum. A review of a
-- card whose lesson later loses a merge contest has to stay referentially intact -- `lesson_reviews`
-- is append-only and is the sole source of every FSRS state in the app, so deleting a lesson would
-- cascade a scheduling history nothing else records into nothing. The boolean could not express
-- this: `active = false` meant BOTH "candidate, not yet judged" and "judged and rejected", so the
-- ingestion pipeline had to delete losers to keep the two apart.
create type public.lesson_status as enum ('provisional', 'active', 'archived');

create table public.lessons (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_id bigint not null references public.sources (id) on delete cascade,
  section_id bigint references public.source_sections (id) on delete set null,
  -- Imperative where possible: "Use the two-minute rule to start", not "On starting".
  title text not null,
  core_claim text not null,
  mechanism text,
  -- The seam to Desired Self, and a non-negotiable from the brief. A lesson proposes a behaviour;
  -- trying it becomes an `experiments` row; the trial feeds the dimension the source serves. That
  -- chain is the knowing-to-doing bridge, and it starts as this column.
  claim_to_task text,
  evidence_strength public.evidence_strength,
  -- THE HALLUCINATION FIREWALL. Both NOT NULL: no grounding passage, no lesson. A lesson that
  -- cannot cite the text it came from is a claim the model made up, and the quality gate drops it
  -- during ingestion rather than storing it and hoping the UI hides it. Enforced here so no future
  -- write path can bypass the gate.
  provenance_quote text not null,
  page_ref integer,
  embedding extensions.vector(1024),
  -- A user may retire a lesson without deleting it, and the merge pass may archive one; the review
  -- log referencing either must stay valid. See `lesson_status` above for why this is an enum and
  -- not the boolean it started as.
  status public.lesson_status not null default 'provisional',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lessons_title_not_blank check (btrim(title) <> ''),
  constraint lessons_claim_not_blank check (btrim(core_claim) <> ''),
  constraint lessons_provenance_not_blank check (btrim(provenance_quote) <> '')
);

create index lessons_user_status_idx on public.lessons (user_id, status);
create index lessons_source_idx on public.lessons (source_id);
create index lessons_embedding_idx
  on public.lessons
  using hnsw (embedding extensions.vector_cosine_ops);

create trigger lessons_set_updated_at
  before update on public.lessons
  for each row execute function public.set_updated_at();

alter table public.lessons enable row level security;
alter table public.lessons force row level security;

create policy lessons_all_own on public.lessons
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on column public.lessons.status is
  'provisional -> active -> archived (ULM ADR-010). Losers of a merge dedup contest are ARCHIVED, '
  'never deleted: `lesson_reviews` is append-only and is the sole source of every FSRS state in '
  'the app, so a deleted lesson would cascade away a scheduling history nothing else records. '
  'Migration 60 suspends an archived lesson''s cards by trigger.';

comment on column public.lessons.provenance_quote is
  'The verbatim passage this lesson came from. NOT NULL is the hallucination firewall: no '
  'grounding passage, no lesson. Enforced in the schema so no future write path can bypass the '
  'ingestion quality gate.';

-- ============================================================================
-- 3. Cards and the review log
-- ============================================================================

-- Mixed prompt types per the research: free recall and application carry the retrieval load, cloze
-- supplies the generation effect, and why-questions force self-explanation.
create type public.lesson_prompt_type as enum ('free_recall', 'application', 'cloze', 'why');

-- Named lesson_cards, never `cards`. M14: `cards` already means the motivation rotation shown at
-- End-of-Hour, and one word cannot mean both a spaced-repetition item and a wall card.
create table public.lesson_cards (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  lesson_id bigint not null references public.lessons (id) on delete cascade,
  prompt_type public.lesson_prompt_type not null,
  prompt text not null,
  answer text not null,
  sort_order smallint not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_cards_prompt_not_blank check (btrim(prompt) <> ''),
  constraint lesson_cards_answer_not_blank check (btrim(answer) <> '')
);

create index lesson_cards_lesson_idx on public.lesson_cards (lesson_id, sort_order);
create index lesson_cards_user_active_idx on public.lesson_cards (user_id, active);

create trigger lesson_cards_set_updated_at
  before update on public.lesson_cards
  for each row execute function public.set_updated_at();

alter table public.lesson_cards enable row level security;
alter table public.lesson_cards force row level security;

create policy lesson_cards_all_own on public.lesson_cards
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- FSRS's four grades. Deliberately NOT the Question Bank's Sure/Think-so/Guessing: D31 rules that
-- the two survive side by side because they measure different things at different moments --
-- confidence before the reveal versus difficulty after it.
create type public.fsrs_rating as enum ('again', 'hard', 'good', 'easy');

-- APPEND-ONLY. A non-negotiable from the brief, and the same shape as `attempts` (migration 42):
-- there are no scheduler-state columns anywhere in this migration, because per-card stability,
-- difficulty and due date are a pure function of this log. Derived state cannot drift from its log,
-- needs no cron whose silent failure would freeze every due date, and lives in packages/core as a
-- testable function rather than an accumulated number nothing can check.
create table public.lesson_reviews (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  card_id bigint not null references public.lesson_cards (id) on delete cascade,
  session_id bigint,
  rating public.fsrs_rating not null,
  -- Time from prompt shown to grade tapped. Feeds per-user FSRS optimisation later.
  elapsed_ms integer check (elapsed_ms is null or elapsed_ms >= 0),
  -- What the user actually wrote before the reveal. The generation effect depends on the attempt
  -- existing, and keeping it is what makes AI grading assist and later analysis possible at all.
  answered_text text,
  ai_feedback text,
  reviewed_at timestamptz not null default now(),
  local_date date not null
);

create index lesson_reviews_user_card_idx on public.lesson_reviews (user_id, card_id, reviewed_at);
create index lesson_reviews_user_date_idx on public.lesson_reviews (user_id, local_date);

alter table public.lesson_reviews enable row level security;
alter table public.lesson_reviews force row level security;

-- Insert and select only. No update, no delete: this is the one table in the schema whose value
-- depends on never being rewritten, so the absent policies are the enforcement.
create policy lesson_reviews_select_own on public.lesson_reviews
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy lesson_reviews_insert_own on public.lesson_reviews
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

comment on table public.lesson_reviews is
  'Append-only review log. No UPDATE or DELETE policy exists, deliberately -- this log is the sole '
  'source of every FSRS state in the app, and a rewritten row would silently change a scheduling '
  'history nothing else records.';

-- ============================================================================
-- 4. Sessions
-- ============================================================================

-- The daily retention session's own record. Distinct from task_sessions, which holds the Hour it
-- ran inside when there was one -- linked, not duplicated (D27).
create table public.learn_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  cards_reviewed smallint not null default 0 check (cards_reviewed >= 0),
  new_lessons_introduced smallint not null default 0 check (new_lessons_introduced >= 0),
  task_session_id bigint references public.task_sessions (id) on delete set null,
  created_at timestamptz not null default now()
);

create index learn_sessions_user_date_idx on public.learn_sessions (user_id, local_date desc);

alter table public.learn_sessions enable row level security;
alter table public.learn_sessions force row level security;

create policy learn_sessions_all_own on public.learn_sessions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- D29: there is NO streak table, no current_streak, no freezes_available. The brief specs all
-- three; D23 killed that shape, and the due queue is the comeback mechanic instead -- finite,
-- visible, clearable, structurally identical to qada. Everything the streak would have shown is
-- derivable from the rows above: a per-day session binary, bounce-back, and memory strength.

-- ============================================================================
-- 5. Ingestion jobs
-- ============================================================================

-- The resumable state machine that makes Edge Functions the right runtime for multi-minute work
-- (the ULM brief's Section 11 question, answered in docs/IHSAN_RECONCILIATION.md §3.2b). No single
-- invocation runs long: each one advances one step, checkpoints its cursor, and returns. A cron
-- re-drives anything stalled -- the same shape as the Deepgram flow, adapted to steps.
create type public.ingest_step as enum (
  'queued',
  'extracting_text',
  'parsing_structure',
  'chunking',
  'embedding',
  'extracting_lessons',
  'merging',
  -- ADDED IN PLACE, and this file's header says why that is legal here: migration 54 is applied
  -- nowhere, and Postgres forbids using a value added by `alter type ... add value` in the same
  -- transaction that adds it -- so a later migration introducing this one word would have to be
  -- a migration entirely of its own, exactly as migration 60's header records ULM having to do
  -- twice. Declaring it at creation costs nothing.
  --
  -- WHY IT IS A STEP OF ITS OWN and not the tail of `merging`: generating cards is one model
  -- call PER SURVIVING LESSON -- tens of calls for a book -- and the one rule of this state
  -- machine is that no single invocation runs long. It advances a SLICE of lessons per
  -- invocation with a checkpointed cursor, exactly like `extracting_text` and
  -- `extracting_lessons` do.
  --
  -- WHY IT SITS AFTER `merging`: cards are generated only for lessons that survived the dedup
  -- contest and were promoted to 'active'. Generating them before would pay for cards attached
  -- to lessons about to be archived -- cards migration 60's trigger would immediately suspend,
  -- and which nobody could ever be shown.
  --
  -- WHAT IT UNBLOCKS: `source_status = 'partial'` (ULM ADR-010) is evaluated on lessons that
  -- have SERVABLE CARDS. Until something wrote `lesson_cards`, that latch could never fire and
  -- a finished ingestion produced a library with nothing to review.
  'generating_cards',
  'done',
  'failed'
);

create table public.ingest_jobs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  source_id bigint not null references public.sources (id) on delete cascade,
  step public.ingest_step not null default 'queued',
  -- Where the current step got to: a page number, a chunk index, a Batch API id. Shape depends on
  -- the step and is documented at each writer, deliberately jsonb rather than a column per step.
  cursor jsonb not null default '{}'::jsonb,
  attempts smallint not null default 0 check (attempts >= 0),
  last_error text,
  -- Written whenever a step advances. A job whose heartbeat is old is what the re-driver looks for,
  -- which is more honest than a timeout on the row's age -- a long job is not a stalled one.
  heartbeat_at timestamptz not null default now(),
  cost_usd numeric(8, 4) not null default 0 check (cost_usd >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ingest_jobs_one_live_per_source unique (source_id)
);

create index ingest_jobs_step_heartbeat_idx on public.ingest_jobs (step, heartbeat_at);

create trigger ingest_jobs_set_updated_at
  before update on public.ingest_jobs
  for each row execute function public.set_updated_at();

alter table public.ingest_jobs enable row level security;
alter table public.ingest_jobs force row level security;

create policy ingest_jobs_all_own on public.ingest_jobs
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on column public.ingest_jobs.cost_usd is
  'Accumulated model spend for this ingestion. Surfaced per source so the brief''s $0.50-$1.50 '
  'target is validated against three real books before anything is optimised, rather than '
  'discovered as a monthly total.';

-- ============================================================================
-- 6. Per-user Learn settings (D39)
-- ============================================================================

alter table public.profiles
  add column daily_new_lesson_limit smallint not null default 3
    check (daily_new_lesson_limit between 0 and 20),
  -- FSRS's target retention. 0.9 is the library default and the brief's.
  add column desired_retention numeric(3, 2) not null default 0.90
    check (desired_retention between 0.70 and 0.99),
  -- One notification per day, at a time the user picks. NULL means none, which is the default:
  -- an app that starts notifying before being asked to has spent trust it has not earned.
  add column learn_notification_time time;
