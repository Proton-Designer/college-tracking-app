-- L6: focus sessions. task_sessions (migration 0005) already had the shape for a
-- completed session's numbers, but no lifecycle state -- there was no way to represent
-- "in progress" vs "finished normally" vs "abandoned", which the calibration engine
-- (packages/core §3) genuinely needs to tell apart: an abandoned session's
-- actual_duration_min reflects how long the user worked before giving up, not how long
-- the task actually took, and must never train the calibration multiplier the same way
-- a completed session does.

alter table public.task_sessions
  add column status text not null default 'active'
    check (status in ('active', 'completed', 'abandoned'));

-- "Resumable" (the app can be backgrounded/killed mid-session and resume from
-- actual_start, wall-clock, not a JS interval) only makes sense if there's exactly one
-- session to resume. Enforced here, not just in application code, so a retried/duplicate
-- start request can never silently create a second concurrent session for the same user.
create unique index task_sessions_one_active_per_user_idx
  on public.task_sessions (user_id)
  where status = 'active';

comment on column public.task_sessions.status is
  'active: in progress, resumable from actual_start. completed: finished normally, '
  'counts toward calibration. abandoned: stopped early, actual_duration_min is real but '
  'must never be treated as a true task-duration observation.';

-- Backfill: any row already carrying a real actual_duration_min predates this column and
-- is, by construction, a finished session -- the 'active' default would otherwise
-- mislabel every pre-existing seeded/historical session as still in progress.
update public.task_sessions
  set status = 'completed'
  where actual_duration_min is not null and status = 'active';
