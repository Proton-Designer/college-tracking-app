-- A2 (docs/FOLLOWUPS.md): the brief's implementation-intention plans are timeboxed --
-- "BME exam prep · 4:30-5:45 PM · WALC library" -- and start delay ("planned 4:00 /
-- actual 5:07") is a headline metric. `tasks` only ever carried planned_date (a day, no
-- time-of-day), so neither could be represented. Both nullable: not every task is
-- timeboxed, and forcing one would be worse than not having it -- a task with no real
-- plan must be able to say so, not be coerced into a fake 00:00 start time.

alter table public.tasks
  add column planned_start_at timestamptz,
  add column planned_location text;

comment on column public.tasks.planned_start_at is
  'When the user planned to start this task (an implementation intention''s "when"), '
  'not when it is due. Null means untimeboxed -- start delay must be reported as null '
  '(unknown), never 0 (on time), for a task with no real plan.';
