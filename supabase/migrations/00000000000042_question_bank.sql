-- S3: the Question Bank (BLUEPRINT 5.4), adjusted by what this codebase has taught:
--
-- There are deliberately NO scheduler-state columns (interval/ease/lapses/due_date) and
-- NO nightly scheduler cron, though the blueprint specifies both. SM-2 state is a pure
-- function of the attempts log, which makes it exactly the habit-score case (migration
-- 35's comment): derived state cannot drift from its log, needs no cron whose silent
-- failure would freeze every due date, and lives in packages/core as a testable
-- function instead of an accumulated number nothing can check. If scale ever demands a
-- snapshot, it gets added WITH a write-time trigger then -- not speculatively now.

create table public.questions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id bigint not null references public.courses (id) on delete cascade,
  prompt text not null,
  answer text not null,
  -- BLUEPRINT 5.4: anchors exist so answers get verified against actual course material.
  -- Required-or-explicitly-skipped, not optional-and-forgotten: a skipped anchor is a
  -- recorded decision, and the CHECK makes silent omission unrepresentable.
  source_anchor text,
  source_skipped boolean not null default false,
  topic text,
  -- 'missed' is reserved for S4's practice-test conversion -- the enum value exists so
  -- the vocabulary is stable, but nothing writes it until practice tests do.
  origin text not null default 'self' check (origin in ('self', 'ai', 'missed')),
  -- Retired, never deleted: an attempt history referencing a vanished question would
  -- corrupt calibration.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questions_prompt_not_blank check (btrim(prompt) <> ''),
  constraint questions_answer_not_blank check (btrim(answer) <> ''),
  constraint questions_anchor_present_or_skipped
    check (source_anchor is not null or source_skipped)
);

create index questions_user_course_idx on public.questions (user_id, course_id, active);

create trigger questions_set_updated_at
  before update on public.questions
  for each row execute function public.set_updated_at();

alter table public.questions enable row level security;
alter table public.questions force row level security;

create policy questions_all_own on public.questions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- The log everything derives from. Append-only like semester_lessons and the usage
-- ledger: no UPDATE/DELETE policy, because editing history would rewrite the scheduler
-- state and the calibration record retroactively.
create table public.attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id bigint not null references public.questions (id) on delete cascade,
  -- The user's local calendar day, computed by the caller through core's primitives --
  -- intervals are day-granular and B4's rule holds: never derive a day from UTC.
  local_date date not null,
  -- Calibration tap, BEFORE the answer reveal.
  confidence text not null check (confidence in ('sure', 'thinkso', 'guessing')),
  correct boolean not null,
  created_at timestamptz not null default now()
);

create index attempts_user_question_idx on public.attempts (user_id, question_id, local_date);
create index attempts_user_date_idx on public.attempts (user_id, local_date);

alter table public.attempts enable row level security;
alter table public.attempts force row level security;

create policy attempts_select_own on public.attempts
  for select to authenticated
  using ((select auth.uid()) = user_id);
create policy attempts_insert_own on public.attempts
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

-- The Mode an Hour ran as (BLUEPRINT 5.3's execution templates). On the EXECUTED side;
-- C5's ruling that planned blocks gain a mode column stands separately and later.
alter table public.task_sessions
  add column mode text
    check (mode is null or mode in ('retrieval', 'interleave', 'draft', 'recite', 'compose', 'cards'));
