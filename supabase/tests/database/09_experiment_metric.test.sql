-- Proves experiments.metric_name (migration 0032): defaults to null, an owner can set it
-- on their own trial, and the existing experiments_all_own RLS policy (a single `for all`
-- policy scoped by user_id) already covers this column without any new policy, including
-- blocking a cross-user write.
--
-- The metric FILTERING itself -- getExperimentOutcome scoring only measurements whose
-- metric matches metric_name -- is application-layer logic in packages/api and is proven
-- by its own integration test. pgTAP proves the DB-level guarantee, not the engine's
-- behaviour. What IS proven here is the shape that made the filtering bug possible: two
-- differently-named metrics can coexist on one experiment, so a consumer that fails to
-- filter really would mix them.
begin;
select no_plan();

insert into auth.users (id, email) values
  ('40000000-0000-0000-0000-0000000000e1', 'metric-a@test.local'),
  ('40000000-0000-0000-0000-0000000000e2', 'metric-b@test.local');
-- profiles rows are auto-created by the on_auth_user_created trigger.

insert into public.experiments (id, user_id, hypothesis, start_date, status) overriding system value values
  (910001, '40000000-0000-0000-0000-0000000000e1', 'Buffered estimates reduce slippage', '2026-08-01', 'running'),
  (910002, '40000000-0000-0000-0000-0000000000e2', 'Someone else''s trial', '2026-08-01', 'running');

set role authenticated;
set request.jwt.claims = '{"sub":"40000000-0000-0000-0000-0000000000e1","role":"authenticated"}';

select is(
  (select metric_name from public.experiments where id = 910001),
  null::text,
  'a trial created without declaring a measurable has metric_name null -- not an invented default'
);

update public.experiments set metric_name = 'minutes_late' where id = 910001;

select is(
  (select metric_name from public.experiments where id = 910001),
  'minutes_late',
  'the owner can declare their own trial''s measurable'
);

-- The shape that made the unfiltered-scoring bug real: one experiment, two metrics.
insert into public.experiment_measurements (user_id, experiment_id, metric, value, local_date) values
  ('40000000-0000-0000-0000-0000000000e1', 910001, 'minutes_late', 12, '2026-08-02'),
  ('40000000-0000-0000-0000-0000000000e1', 910001, 'relapses_after_stuck', 3, '2026-08-02');

select is(
  (select count(distinct metric)::int from public.experiment_measurements where experiment_id = 910001),
  2,
  'one experiment can hold measurements under two different metrics -- so a consumer that does not filter by metric_name really would average unrelated readings together'
);

select is(
  (select count(*)::int from public.experiment_measurements
    where experiment_id = 910001 and metric = (select metric_name from public.experiments where id = 910001)),
  1,
  'filtering measurements by the trial''s declared metric_name selects only the readings that belong to it'
);

-- RLS: the existing single `for all` policy must already cover the new column.
update public.experiments set metric_name = 'stolen' where id = 910002;

select is(
  (select count(*)::int from public.experiments where id = 910002 and metric_name = 'stolen'),
  0,
  'a user cannot set metric_name on another user''s trial -- experiments_all_own already covers this column'
);

select * from finish();
rollback;
