-- computeExperimentOutcome (packages/core) was built, unit-tested, and correctly reuses
-- gateInsightConfidence -- but experiments stored neither a baseline value nor a
-- hypothesized direction, so nothing could ever actually call it. Same shape as D19/D20's
-- prior instances: correct code, proven in isolation, no real path to invocation. Found
-- live by Nova building /insights -- rather than fabricate a "current direction" verdict
-- against a baseline that didn't exist, he showed the trial's own first-half vs
-- second-half movement, explicitly labelled "so far" -- honest, but it meant the actual
-- outcome-scoring engine was dead code.
--
-- Both nullable: an experiment created before this migration, or one started without a
-- measurable baseline, legitimately has neither -- null must stay distinguishable from
-- zero (a real baseline value can itself be zero, e.g. "zero relapses per week").
alter table public.experiments
  add column baseline_value numeric,
  add column hypothesized_direction text
    check (hypothesized_direction is null or hypothesized_direction in ('increase', 'decrease'));
