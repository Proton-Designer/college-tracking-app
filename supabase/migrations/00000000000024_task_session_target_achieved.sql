-- The brief's completion-capture prompt -- "Did you accomplish the target?
-- [Yes] [Partly] [No]" -- had no column to land in. Nullable, not defaulted: an
-- abandoned session genuinely has no answer, and null must stay distinguishable from
-- 'no' (same null-vs-zero principle as tasks.planned_start_at's start-delay handling).
--
-- text + CHECK, matching this schema's existing enum convention (oauth_connections.
-- provider, calendar_events.source) rather than a Postgres enum type.
--
-- Enables comparing self-assessed achievement against objective_output/subjective_focus
-- at session granularity -- the brief's own Skeptic example ("you described today as
-- unproductive but completed both academically critical MITs") one level more granular.
alter table public.task_sessions
  add column target_achieved text
  check (target_achieved is null or target_achieved in ('yes', 'partly', 'no'));
