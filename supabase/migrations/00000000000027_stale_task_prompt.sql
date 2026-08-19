-- The stale-task surface (FOLLOWUPS.md S5): recoveryMode.ts's overdueTaskCount is
-- correctly windowed to 7 days, but that means a task older than 7 days stops counting
-- toward Recovery Mode AND isn't surfaced anywhere else -- the product silently
-- accumulates dead tasks. A new intervention kind, same mechanism as the other three
-- (exception_notification/deviation_prompt/escalation_action), not a new table.
alter table public.interventions drop constraint interventions_kind_check;
alter table public.interventions
  add constraint interventions_kind_check
  check (kind in ('exception_notification', 'deviation_prompt', 'escalation_action', 'stale_task_prompt'));
