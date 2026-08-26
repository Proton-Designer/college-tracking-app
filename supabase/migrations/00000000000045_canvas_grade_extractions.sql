-- Canvas grades → Ledger, staged (docs/CANVAS_AUDIT.md §4.3). Fourth instance of the
-- one-path-to-done architecture: the poll writes PROPOSALS here, and nothing touches
-- grade_items until the user confirms. A Canvas submission score is ground truth from
-- the LMS, but the match to a local grade_items row is a heuristic -- and a wrong match
-- silently writing a wrong grade into the Ledger is exactly what staging exists to stop.
create table public.canvas_grade_extractions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id bigint not null references public.courses (id) on delete cascade,
  canvas_assignment_id bigint not null,
  canvas_assignment_name text not null,
  score numeric(8, 2) not null,
  points_possible numeric(8, 2),
  graded_at timestamptz,
  -- Exact case-insensitive name match against the course's grade_items, else null.
  -- A SUGGESTION the user corrects at confirm time, never trusted as fact -- the same
  -- wording as ics_event_extractions.course_id.
  suggested_grade_item_id bigint references public.grade_items (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'applied', 'rejected')),
  applied_grade_item_id bigint references public.grade_items (id) on delete set null,
  applied_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (user_id, canvas_assignment_id)
);

create index canvas_grade_extractions_user_status_idx
  on public.canvas_grade_extractions (user_id, status);

alter table public.canvas_grade_extractions enable row level security;
alter table public.canvas_grade_extractions force row level security;

create policy canvas_grade_extractions_all_own on public.canvas_grade_extractions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.canvas_grade_extractions is
  'Graded Canvas submissions staged for the Ledger. canvas-sync stages; applying a score '
  'to a grade_items row happens only through the user''s explicit confirmation -- same '
  'one-path-to-done architecture as syllabus/ics/announcement staging.';
