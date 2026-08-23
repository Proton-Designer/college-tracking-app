-- P1 (docs/FOLLOWUPS.md): confirming a weekly-plan block left no trace anywhere outside the
-- planning module -- Today, the Day Trace, and the friction engine never learned a block was
-- confirmed, because nothing outside weekly_plan_blocks ever read it. task_id closes that
-- gap: confirming a block now creates a real row in public.tasks and stores its id here, so
-- the block IS the plan's link into execution rather than a dead-end record of its own.
alter table public.weekly_plan_blocks
  add column task_id bigint references public.tasks (id) on delete set null;

create index weekly_plan_blocks_task_id_idx on public.weekly_plan_blocks (task_id);

comment on column public.weekly_plan_blocks.task_id is
  'Set when this block is confirmed -- the real task Today and the friction engine read. Null for a still-suggested or never-confirmed block. ON DELETE SET NULL, not CASCADE: deleting the task directly must not erase the plan''s own record of what was scheduled here.';
