-- Enum policy (see docs/DATA_MODEL.md "Enum policy" for the full rationale): Postgres
-- ENUM is reserved for closed sets we control that mirror a packages/core TypeScript
-- union and are unlikely to churn. Everything else (task/deliverable/experiment status,
-- extraction status, ...) uses text + CHECK, since those vocabularies are expected to
-- grow as UI flows get built during active development, and enums are easy to extend
-- but painful to shrink or reorder.
create type public.risk_band as enum ('low', 'moderate', 'high', 'critical');
create type public.confidence_level as enum ('high', 'moderate', 'low', 'insufficient');
create type public.insight_confidence_level as enum ('high', 'medium', 'testing');
create type public.commitment_level as enum (
  'l0_reminder',
  'l1_stronger_notification',
  'l2_distraction_block',
  'l3_accountability_partner',
  'l4_consequence'
);
create type public.friction_cause as enum (
  'underestimated_duration',
  'unclear_next_action',
  'distracted',
  'tired',
  'schedule_changed',
  'avoided_task',
  'higher_priority_appeared',
  'other'
);
create type public.deliverable_type as enum ('paper', 'report', 'problem_set', 'exam', 'project', 'reading');

-- local_date: the single source of truth for "what local calendar day was this instant".
-- Day boundaries are ALWAYS local -- never derive a day from UTC. Callers compute this at
-- write time and store the result (see docs/DATA_MODEL.md "Timezone") rather than
-- recomputing on read, because a user's timezone can change and history must stay
-- anchored to the day it actually happened in.
create or replace function public.local_date(ts timestamptz, tz text)
returns date
language sql
stable
set search_path = ''
as $$
  select (ts at time zone tz)::date;
$$;

comment on function public.local_date(timestamptz, text) is
  'Converts an instant to the calendar date in the given IANA timezone. The one true '
  'day-boundary computation in this schema -- never derive a day from UTC directly.';

-- Generic updated_at trigger, attached per-table below.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
