-- L12A (E1-E5 audit): courses had no way to represent a semester ending. Archive is a
-- real concept -- a completed course must stay visible on its own detail page (grades,
-- deliverables, history) without continuing to feed Today's MIT/risk assembly, weekly
-- planning, or nightly analysis as if it were still live coursework.
--
-- Nullable, not a default-false boolean: null unambiguously means "never archived",
-- matching this codebase's own null-vs-fabricated-value discipline elsewhere (A2's
-- planned_start_at, S11's export). The timestamp also records *when* it was archived,
-- which a boolean would throw away for free.
--
-- No new RLS policy needed: courses_all_own (migration 0004) is a single `for all`
-- policy scoped by user_id, already covering every column including this one for
-- select/insert/update/delete. See supabase/tests/database/08_course_archive.test.sql.
--
-- Read-path audit (which queries against `courses` must now exclude archived rows,
-- performed alongside this migration):
--   Excluded (archived_at is null added):
--     - packages/api/src/data/courses.ts's listCourses (default; explicit opt-in to include)
--     - packages/api/src/planning/weeklyPlan.ts (weekly capacity/placement course facts)
--     - packages/api/src/day/dayView.ts (Today's risk assessment + MIT course facts)
--     - supabase/functions/_shared/nightly/assembleReport.ts (nightly risk assessment)
--     - supabase/functions/_shared/nightly/buildContext.ts's loadDurableProfile (LLM context)
--     - supabase/functions/_shared/brightspace/syncFeed.ts (ICS course-code matching)
--   Left as explicit-id lookups (archived status irrelevant -- viewing a specific known
--   record must still work regardless of archive state):
--     - packages/api/src/data/courses.ts's getCourse (course detail page)
--     - packages/api/src/day/focusSessions.ts (a focus session's course, for session detail)
--     - supabase/functions/_shared/syllabus/confirm.ts (writes to a specific courseId
--       already chosen earlier in the confirm flow)

alter table public.courses
  add column archived_at timestamptz;

comment on column public.courses.archived_at is
  'When the user archived this course (a semester ending), or null if still active. '
  'Archived courses are excluded from Today''s risk/MIT assembly, weekly planning, and '
  'nightly analysis, but remain fully visible on their own detail page -- this is an '
  'archive, not a delete.';
