-- E0 hardening: a completion prediction is a claim about work. With zero MITs planned
-- there is no work and no claim, so predicted_completion_pct must be able to record
-- "no prediction was made" as a real, distinct fact -- not collapse into a fabricated
-- default (the UI previously hardcoded 80 regardless of whether any MIT existed) or a
-- dishonest 0 (which would itself claim "predicted finishing nothing", a real assertion
-- the user never made). See docs/FOLLOWUPS.md for the full chain this closes.
--
-- The existing check constraint (predicted_completion_pct between 0 and 100) already
-- passes a null value under SQL's three-valued logic -- no need to touch it.
alter table public.daily_predictions
  alter column predicted_completion_pct drop not null;

comment on column public.daily_predictions.predicted_completion_pct is
  'Null means no prediction was made (zero MITs planned that day, so there was nothing '
  'to predict) -- distinct from 0, which would claim the user predicted finishing '
  'nothing. scorePredictionForDate must skip scoring entirely when this is null.';
