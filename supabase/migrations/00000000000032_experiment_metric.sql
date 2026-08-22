-- U9: an N-of-1 trial had no way to say what it measures.
--
-- The brief frames experiments as "an N-of-1 trial with defined measures". In practice
-- `experiments` carried a free-text `hypothesis` and `protocol` and nothing structured,
-- and `runExperiment`'s own doc comment conceded it: measures were "folded into
-- `protocol`, the schema's free-text methodology field -- there's no separate structured
-- 'measures' column."
--
-- Two consequences, both live before this migration:
--
--   1. The metric only ever existed on `experiment_measurements.metric`, free text, per
--      row. Nothing tied those rows to a single agreed measurable, so a trial could
--      accumulate readings under two different metric names.
--
--   2. getExperimentOutcome fed EVERY measurement for an experiment into
--      computeExperimentOutcome without filtering by metric -- so a trial holding both
--      `relapses_after_stuck` and `minutes_late` would average them together and report
--      the mean as a verdict. Nothing had triggered it only because no UI ever logged a
--      measurement at all (U9). A dormant correctness bug, not a hypothetical one.
--
-- Nullable rather than NOT NULL with a backfill: existing rows genuinely never declared a
-- metric, and inventing one for them would be exactly the fabrication this codebase
-- refuses everywhere else (A2's planned_start_at, S11's export, E0's 80% prediction).
-- Null means "this trial never named its measurable" -- which is the truth about every
-- experiment created before today, and is precisely why none of them can be scored.
--
-- getExperimentOutcome filters by this column when it is set, and falls back to the old
-- unfiltered behaviour when it is null -- so historical trials keep whatever verdict they
-- could already produce, and every new trial gets a correct, single-metric one.
--
-- No new RLS policy needed: experiments_all_own is a single `for all` policy scoped by
-- user_id and already covers every column. See
-- supabase/tests/database/09_experiment_metric.test.sql.

alter table public.experiments
  add column metric_name text;

comment on column public.experiments.metric_name is
  'The single measurable this N-of-1 trial scores. Matches experiment_measurements.metric. '
  'Null means the trial never declared one -- such a trial cannot be scored, and that is a '
  'true statement about it rather than a missing value to be filled in.';
