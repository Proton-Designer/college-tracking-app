-- Tier 4 / S2: parse_announcement's staging table (BLUEPRINT 5.2 "Announcements").
--
-- Same staging discipline as syllabus_extractions and ics_event_extractions: the parse
-- writes a PROPOSAL here (parsed_diff), and nothing touches deliverables until the user
-- confirms through the announcement-confirm function -- the third instance of the
-- "one path to done" architecture, not a new invention.
--
-- The blueprint's own shape (Part VI: raw_text, parsed_diff jsonb, applied) extended with
-- the status vocabulary and failure_reason the other two staging tables taught us to
-- carry: "no schedulable content" is a real, common outcome (5.2: "announcements with no
-- schedulable content just get filed to the course") and must be distinguishable from a
-- parse failure, or the UI shows an error for a professor saying "good luck on Friday".

create table public.announcements (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- NOT NULL: the paste flow picks the course. Parsing needs the course's deliverables
  -- as matching context, and "which course said this" is not recoverable from prose.
  course_id bigint not null references public.courses (id) on delete cascade,
  raw_text text not null,
  -- The staged proposal: {changes: [...], confidence}. Null until parsed.
  parsed_diff jsonb,
  parse_confidence numeric(4, 3)
    check (parse_confidence is null or parse_confidence between 0 and 1),
  -- text + CHECK per the enum policy: this vocabulary grew twice on the other staging
  -- tables and will grow here.
  status text not null default 'pending'
    check (status in ('pending', 'parsed', 'no_schedulable_content', 'failed', 'applied', 'rejected')),
  failure_reason text,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_raw_text_not_blank check (btrim(raw_text) <> '')
);

create index announcements_user_course_idx on public.announcements (user_id, course_id);
create index announcements_user_status_idx on public.announcements (user_id, status);

create trigger announcements_set_updated_at
  before update on public.announcements
  for each row execute function public.set_updated_at();

alter table public.announcements enable row level security;
alter table public.announcements force row level security;

create policy announcements_all_own on public.announcements
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

comment on table public.announcements is
  'Pasted professor announcements. parse-announcement stages a diff into parsed_diff; '
  'announcement-confirm is the ONLY path from a staged diff to a deliverables write -- '
  'same one-path-to-done architecture as syllabus_extractions and ics_event_extractions.';
