-- L9: the decision-and-record layer for interventions -- deterministic triggers only,
-- no LLM in the trigger path (packages/core computes whether/why; this table only
-- persists the outcome). No push infrastructure exists tonight, so this is what lets
-- the UI surface interventions in-app and lets behavior-change effectiveness be
-- measured later -- delivered vs acted-on vs ignored is the product's north-star
-- metric per the brief, so the schema has to support that measurement from the start,
-- not be bolted on once push exists.

create table public.interventions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('exception_notification', 'deviation_prompt', 'escalation_action')),
  -- The specific, deterministic, citable fact that justified this firing -- e.g. "BME
  -- block begins in 8 min. You've used 41 min of social media today." Never
  -- "encouragement" -- the brief is explicit that a notification with no cited fact is
  -- exactly the pattern that gets the whole feature disabled within a week.
  trigger_reason text not null,
  message text not null,
  -- The action buttons actually offered, e.g. {Start,"Move block"} or
  -- {Forgot,Avoiding,"Schedule changed","Start now"}. Every intervention must offer at
  -- least one real action.
  actions text[] not null check (array_length(actions, 1) >= 1),
  related_task_id bigint references public.tasks (id) on delete set null,
  related_kill_habit_id bigint references public.kill_habits (id) on delete set null,
  occurred_at timestamptz not null default now(),
  local_date date not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'acted_on', 'ignored', 'expired')),
  -- Must be one of `actions` when set -- enforced in application code (day/interventionEvaluation.ts),
  -- not here, since a DB-level check against a sibling array column needs a trigger and
  -- the application layer is already the single place that constructs both together.
  action_taken text,
  responded_at timestamptz
);

create trigger interventions_sync_local_date
  before insert or update of occurred_at, user_id on public.interventions
  for each row execute function public.sync_local_date_from_occurred_at();

create index interventions_user_id_idx on public.interventions (user_id);
create index interventions_local_date_idx on public.interventions (user_id, local_date);
create index interventions_status_idx on public.interventions (user_id, status);
create index interventions_related_task_id_idx on public.interventions (related_task_id);

alter table public.interventions enable row level security;
alter table public.interventions force row level security;

create policy interventions_all_own on public.interventions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- "Levels 2-4 are opt-in per behavior" (the brief's own hard rule) -- a per-habit
-- ceiling on how far the ladder is allowed to auto-escalate. Defaults to l1, meaning a
-- freshly created kill habit can never auto-escalate past a stronger notification
-- until the user explicitly raises this for that specific behavior. Escalation must
-- never start at punishment, and this is the structural enforcement of that: even
-- overwhelming evidence (repeated relapses) cannot move a habit's real escalation_level
-- past what this column allows.
alter table public.kill_habits
  add column max_escalation_level public.commitment_level not null default 'l1_stronger_notification';
