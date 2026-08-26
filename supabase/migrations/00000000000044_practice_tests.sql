-- S4 / D25: practice tests (BLUEPRINT 5.4 "missed practice-test items convert
-- automatically" + 5.6 rule 1's benchmark input + the blueprint's own schema sketch:
-- "practice_tests  id, course_id, assessment_id, date, score, timed, conditions").
--
-- Score only, not itemized answers: the benchmark rule needs the number, and the missed
-- items become Bank questions (origin='missed' -- reserved for this in migration 42) at
-- log time through createQuestion, where the user writes the prompt/answer they missed.
-- Itemizing answers here would duplicate the Bank's job with a second question store.
create table public.practice_tests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id bigint not null references public.courses (id) on delete cascade,
  -- The exam/quiz this rehearses. Nullable: a standalone timed self-test is legitimate
  -- (no scheduled assessment yet), and the benchmark rule simply never sees it until a
  -- deliverable links a real score.
  deliverable_id bigint references public.deliverables (id) on delete set null,
  local_date date not null,
  score_pct numeric(5, 2) not null check (score_pct between 0 and 100),
  timed boolean not null default false,
  conditions text,
  created_at timestamptz not null default now()
);

create index practice_tests_user_id_idx on public.practice_tests (user_id);
create index practice_tests_deliverable_idx on public.practice_tests (user_id, deliverable_id);

alter table public.practice_tests enable row level security;
alter table public.practice_tests force row level security;

create policy practice_tests_all_own on public.practice_tests
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.practice_tests is
  'Timed/untimed practice-test scores per course, optionally anchored to the exam '
  'deliverable they rehearse. Input to core''s assessPracticeBenchmark (BLUEPRINT 5.6 '
  'rule 1); missed items convert to Bank questions with origin=''missed'' at log time.';
