-- P1 (docs/FOLLOWUPS.md): proves the DB-level half of weekly_plan_blocks.task_id (migration
-- 0033) -- the column exists nullable, a real task can be linked, deleting that task SETS
-- NULL rather than cascading the block away (the block is the plan's own record of what was
-- scheduled and must survive the task it produced being deleted), and the existing
-- weekly_plan_blocks_all_own policy already covers the new column with no policy change.
-- The confirm/idempotency/skip-cancels BEHAVIOR (what writes task_id and when) is
-- application logic in packages/api and is proven by weeklyPlan.itest.ts -- this file only
-- proves the schema-level guarantee the app logic relies on.
begin;
select no_plan();

insert into auth.users (id, email) values
  ('40000000-0000-0000-0000-0000000000f1', 'wkp1-a@test.local'),
  ('40000000-0000-0000-0000-0000000000f2', 'wkp1-b@test.local');
-- profiles rows are auto-created by the on_auth_user_created trigger.

insert into public.courses (id, user_id, code, name, term) overriding system value values
  (910101, '40000000-0000-0000-0000-0000000000f1', 'WKP1', 'Weekly Plan Fixture', 'Fall 2026');

insert into public.tasks (id, user_id, course_id, title, category, planned_date) overriding system value values
  (910102, '40000000-0000-0000-0000-0000000000f1', 910101, 'Confirmed block task', 'deep_work', current_date);

insert into public.weekly_plans (id, user_id, week_start_date, academic_load, total_needed_minutes, total_capacity_minutes, has_unplaced_work) overriding system value values
  (910103, '40000000-0000-0000-0000-0000000000f1', current_date, 'moderate', 90, 300, false);

insert into public.weekly_plan_blocks (id, user_id, weekly_plan_id, course_id, block_date, start_at, end_at, minutes, status, task_id) overriding system value values
  (910104, '40000000-0000-0000-0000-0000000000f1', 910103, 910101, current_date, now(), now() + interval '90 minutes', 90, 'confirmed', 910102);

select is(
  (select task_id from public.weekly_plan_blocks where id = 910104),
  910102::bigint,
  'a block can carry a real task_id once confirmed'
);

-- The FK guarantee the app logic depends on: deleting the task must not delete the block.
delete from public.tasks where id = 910102;

select is(
  (select count(*)::int from public.weekly_plan_blocks where id = 910104),
  1,
  'deleting the linked task does not delete the block -- it is the plan''s own scheduling record, not a copy of the task'
);

select is(
  (select task_id from public.weekly_plan_blocks where id = 910104),
  null::bigint,
  'ON DELETE SET NULL: the block loses the link, not itself, when its task is deleted directly'
);

-- RLS: the existing single `for all` policy must already cover the new column -- no new
-- policy was written for this migration, and there had better not need to be one.
insert into public.weekly_plans (id, user_id, week_start_date, academic_load, total_needed_minutes, total_capacity_minutes, has_unplaced_work) overriding system value values
  (910105, '40000000-0000-0000-0000-0000000000f2', current_date, 'moderate', 90, 300, false);
insert into public.weekly_plan_blocks (id, user_id, weekly_plan_id, block_date, start_at, end_at, minutes, status) overriding system value values
  (910106, '40000000-0000-0000-0000-0000000000f2', 910105, current_date, now(), now() + interval '30 minutes', 30, 'suggested');

insert into public.tasks (id, user_id, title, category, planned_date) overriding system value values
  (910107, '40000000-0000-0000-0000-0000000000f1', 'Attacker''s own task', 'deep_work', current_date);

set role authenticated;
set request.jwt.claims = '{"sub":"40000000-0000-0000-0000-0000000000f1","role":"authenticated"}';

update public.weekly_plan_blocks set task_id = 910107 where id = 910106;

select is(
  (select count(*)::int from public.weekly_plan_blocks where id = 910106 and task_id = 910107),
  0,
  'a user cannot write task_id (or anything else) onto another user''s block -- weekly_plan_blocks_all_own already covers this column, no new policy needed'
);

select * from finish();
rollback;
