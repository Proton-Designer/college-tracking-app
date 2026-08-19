-- Academic cluster: courses, grading, backward-planned deliverables, and the syllabus
-- staging pipeline. See docs/DATA_MODEL.md for the full rationale.

-- ============================================================================
-- courses
-- ============================================================================
create table public.courses (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  code text not null,
  name text not null,
  professor_name text,
  professor_contact text,
  term text not null,
  color text,
  -- 1-5 estimated difficulty and self-rated confidence, feeding packages/core §1.
  difficulty_rating smallint check (difficulty_rating between 1 and 5),
  confidence_rating smallint check (confidence_rating between 1 and 5),
  target_grade_pct numeric(5, 2) check (target_grade_pct between 0 and 100),
  late_policy text,
  attendance_policy text,
  allowed_absences smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index courses_user_id_idx on public.courses (user_id);

create trigger courses_set_updated_at
  before update on public.courses
  for each row execute function public.set_updated_at();

alter table public.courses enable row level security;
alter table public.courses force row level security;

create policy courses_all_own on public.courses
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- course_meetings / course_office_hours: recurring weekly patterns, not dated instances.
-- ============================================================================
create table public.course_meetings (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id bigint not null references public.courses (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6), -- 0 = Sunday
  start_time time not null,
  end_time time not null,
  location text,
  constraint course_meetings_time_order check (end_time > start_time)
);

create index course_meetings_user_id_idx on public.course_meetings (user_id);
create index course_meetings_course_id_idx on public.course_meetings (course_id);

alter table public.course_meetings enable row level security;
alter table public.course_meetings force row level security;

create policy course_meetings_all_own on public.course_meetings
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.course_office_hours (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id bigint not null references public.courses (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  location text,
  constraint course_office_hours_time_order check (end_time > start_time)
);

create index course_office_hours_user_id_idx on public.course_office_hours (user_id);
create index course_office_hours_course_id_idx on public.course_office_hours (course_id);

alter table public.course_office_hours enable row level security;
alter table public.course_office_hours force row level security;

create policy course_office_hours_all_own on public.course_office_hours
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- grade_boundaries: letter-grade cutoffs per course (inclusive lower bounds).
-- ============================================================================
create table public.grade_boundaries (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id bigint not null references public.courses (id) on delete cascade,
  letter text not null,
  min_pct numeric(5, 2) not null,
  unique (course_id, letter)
);

create index grade_boundaries_user_id_idx on public.grade_boundaries (user_id);
create index grade_boundaries_course_id_idx on public.grade_boundaries (course_id);

alter table public.grade_boundaries enable row level security;
alter table public.grade_boundaries force row level security;

create policy grade_boundaries_all_own on public.grade_boundaries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- grade_categories / grade_items: mirrors packages/core's GradeCategory/GradeItem
-- exactly (see docs/DOMAIN_ENGINE_SPEC.md §2). Grades are always recomputed live by
-- packages/core from these rows -- see grade_snapshots (intelligence cluster) for the
-- append-only history used for trend display.
-- ============================================================================
create table public.grade_categories (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id bigint not null references public.courses (id) on delete cascade,
  name text not null,
  weight_pct numeric(5, 2) not null check (weight_pct >= 0),
  drop_lowest_n smallint not null default 0 check (drop_lowest_n >= 0),
  expected_item_count smallint not null default 0 check (expected_item_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index grade_categories_user_id_idx on public.grade_categories (user_id);
create index grade_categories_course_id_idx on public.grade_categories (course_id);

create trigger grade_categories_set_updated_at
  before update on public.grade_categories
  for each row execute function public.set_updated_at();

alter table public.grade_categories enable row level security;
alter table public.grade_categories force row level security;

create policy grade_categories_all_own on public.grade_categories
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.grade_items (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Denormalized alongside category_id: avoids a join in the (very common) "all grade
  -- items for this course" query and keeps RLS a flat equality check.
  course_id bigint not null references public.courses (id) on delete cascade,
  category_id bigint not null references public.grade_categories (id) on delete cascade,
  name text not null,
  points_earned numeric(8, 2),
  points_possible numeric(8, 2) not null check (points_possible > 0),
  is_excused boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Extra credit (points_earned > points_possible) is legitimate and allowed -- see
  -- packages/core's grade projection, which flags it as an issue rather than rejecting it.
  constraint grade_items_earned_non_negative check (points_earned is null or points_earned >= 0)
);

create index grade_items_user_id_idx on public.grade_items (user_id);
create index grade_items_course_id_idx on public.grade_items (course_id);
create index grade_items_category_id_idx on public.grade_items (category_id);

create trigger grade_items_set_updated_at
  before update on public.grade_items
  for each row execute function public.set_updated_at();

alter table public.grade_items enable row level security;
alter table public.grade_items force row level security;

create policy grade_items_all_own on public.grade_items
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- deliverables: anything with a due date that needs backward planning (packages/core §4).
-- Always tied to a course -- personal (non-academic) tasks live in `tasks` instead.
-- ============================================================================
create table public.deliverables (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id bigint not null references public.courses (id) on delete cascade,
  grade_item_id bigint references public.grade_items (id) on delete set null,
  title text not null,
  type public.deliverable_type not null,
  due_at timestamptz not null,
  -- Computed at write time from due_at + the user's timezone -- see
  -- deliverables_sync_local_due_date below. Never recomputed on read.
  local_due_date date not null,
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  status text not null default 'not_started'
    check (status in ('not_started', 'in_progress', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index deliverables_user_id_idx on public.deliverables (user_id);
create index deliverables_course_id_idx on public.deliverables (course_id);
create index deliverables_local_due_date_idx on public.deliverables (user_id, local_due_date);

create trigger deliverables_set_updated_at
  before update on public.deliverables
  for each row execute function public.set_updated_at();

create or replace function public.deliverables_sync_local_due_date()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  tz text;
begin
  select timezone into tz from public.profiles where id = new.user_id;
  new.local_due_date := public.local_date(new.due_at, coalesce(tz, 'UTC'));
  return new;
end;
$$;

create trigger deliverables_sync_local_due_date
  before insert or update of due_at, user_id on public.deliverables
  for each row execute function public.deliverables_sync_local_due_date();

alter table public.deliverables enable row level security;
alter table public.deliverables force row level security;

create policy deliverables_all_own on public.deliverables
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- deliverable_backplans / backplan_milestones: the persisted output of
-- packages/core's buildBackplan. Not append-only like the risk/grade snapshots --
-- this is a live plan the user checks milestones off of, replaced (not accumulated)
-- when capacity or inputs change meaningfully. See docs/DATA_MODEL.md.
-- ============================================================================
create table public.deliverable_backplans (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  deliverable_id bigint not null references public.deliverables (id) on delete cascade,
  generated_at timestamptz not null default now(),
  target_completion_date date not null,
  compressed boolean not null default false,
  infeasible boolean not null default false,
  shortfall_minutes integer not null default 0 check (shortfall_minutes >= 0),
  dropped_phases text[] not null default '{}'
);

create index deliverable_backplans_user_id_idx on public.deliverable_backplans (user_id);
create index deliverable_backplans_deliverable_id_idx
  on public.deliverable_backplans (deliverable_id);

alter table public.deliverable_backplans enable row level security;
alter table public.deliverable_backplans force row level security;

create policy deliverable_backplans_all_own on public.deliverable_backplans
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.backplan_milestones (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  backplan_id bigint not null references public.deliverable_backplans (id) on delete cascade,
  phase text not null,
  milestone_date date not null,
  minutes integer not null check (minutes > 0),
  completed boolean not null default false
);

create index backplan_milestones_user_id_idx on public.backplan_milestones (user_id);
create index backplan_milestones_backplan_id_idx on public.backplan_milestones (backplan_id);
create index backplan_milestones_date_idx on public.backplan_milestones (user_id, milestone_date);

alter table public.backplan_milestones enable row level security;
alter table public.backplan_milestones force row level security;

create policy backplan_milestones_all_own on public.backplan_milestones
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- syllabus_uploads / syllabus_extractions: the mandatory confirmation gate
-- (docs/LLM_LAYER_SPEC.md §8). Nothing reaches courses/grade_categories/grade_items/
-- deliverables except through a row here transitioning to status = 'confirmed' and an
-- application-layer write of the confirmed data -- there is deliberately no trigger or
-- FK path that lets an extraction auto-populate the real tables. That absence is the
-- structural enforcement: confirmation is a distinct, application-driven write.
-- ============================================================================
create table public.syllabus_uploads (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id bigint references public.courses (id) on delete set null,
  file_name text not null,
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending', 'processing', 'completed', 'failed')),
  failure_reason text
);

create index syllabus_uploads_user_id_idx on public.syllabus_uploads (user_id);
create index syllabus_uploads_course_id_idx on public.syllabus_uploads (course_id);

alter table public.syllabus_uploads enable row level security;
alter table public.syllabus_uploads force row level security;

create policy syllabus_uploads_all_own on public.syllabus_uploads
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create table public.syllabus_extractions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  upload_id bigint not null references public.syllabus_uploads (id) on delete cascade,
  item_type text not null
    check (item_type in (
      'course_info', 'assignment', 'exam', 'grade_category', 'policy', 'office_hours'
    )),
  -- The model's structured guess. Deliberately jsonb, not typed columns: the shape
  -- varies by item_type and this table is staging, not the system of record.
  extracted_payload jsonb not null,
  extraction_confidence numeric(4, 3) not null check (extraction_confidence between 0 and 1),
  -- The verbatim source text the model extracted from -- shown beside the item in the
  -- confirmation UI so the user can verify against the original, not just trust the model.
  source_snippet text not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected', 'edited')),
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create index syllabus_extractions_user_id_idx on public.syllabus_extractions (user_id);
create index syllabus_extractions_upload_id_idx on public.syllabus_extractions (upload_id);

alter table public.syllabus_extractions enable row level security;
alter table public.syllabus_extractions force row level security;

create policy syllabus_extractions_all_own on public.syllabus_extractions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
