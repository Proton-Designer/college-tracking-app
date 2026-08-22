-- Proves courses.archived_at (migration 0030): defaults to null, an owner can set and
-- clear it on their own course, and the existing courses_all_own RLS policy (a single
-- `for all` policy scoped by user_id -- see migration 0004) already covers this column
-- without any new policy, including blocking a cross-user archive attempt. The read-path
-- exclusion of archived courses from Today/weekly-planning/nightly is application-layer
-- logic (packages/api, Deno edge functions), proven by their own itests, not here --
-- pgTAP proves the DB-level guarantee, not the engine's filtering behavior.
begin;
select no_plan();

insert into auth.users (id, email) values
  ('30000000-0000-0000-0000-0000000000c1', 'archive-a@test.local'),
  ('30000000-0000-0000-0000-0000000000c2', 'archive-b@test.local');
-- profiles rows are auto-created by the on_auth_user_created trigger.

insert into public.courses (id, user_id, code, name, term) overriding system value values
  (900001, '30000000-0000-0000-0000-0000000000c1', 'BME 301', 'Biomedical Instrumentation', 'Fall 2026'),
  (900002, '30000000-0000-0000-0000-0000000000c2', 'CS 180', 'Problem Solving', 'Fall 2026');

set role authenticated;
set request.jwt.claims = '{"sub":"30000000-0000-0000-0000-0000000000c1","role":"authenticated"}';

select is(
  (select archived_at from public.courses where id = 900001),
  null::timestamptz,
  'a newly created course is not archived by default'
);

update public.courses set archived_at = now() where id = 900001;

select isnt(
  (select archived_at from public.courses where id = 900001),
  null::timestamptz,
  'the owner can archive their own course'
);

update public.courses set archived_at = null where id = 900001;

select is(
  (select archived_at from public.courses where id = 900001),
  null::timestamptz,
  'the owner can un-archive (clear archived_at on) their own course'
);

-- Cross-user: user A attempts to archive user B's course. The existing courses_all_own
-- policy's USING clause hides the row entirely rather than erroring, so this affects
-- zero rows -- same "invisible, not refused" RLS behavior as every other table.
update public.courses set archived_at = now() where id = 900002;

select is(
  (select count(*) from public.courses where id = 900002 and archived_at is not null),
  0::bigint,
  'user A cannot archive user B''s course'
);

reset role;

-- Confirm user B's course was genuinely untouched (checked as postgres, bypassing RLS,
-- so this is a real assertion about the row rather than another view through A's policy).
select is(
  (select archived_at from public.courses where id = 900002),
  null::timestamptz,
  'user B''s course is still unarchived after user A''s blocked attempt'
);

select * from finish();
rollback;
