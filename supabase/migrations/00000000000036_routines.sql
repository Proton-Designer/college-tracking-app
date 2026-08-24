-- Tier 1: the Morning Routine checklist's persistence (BLUEPRINT Part III "Morning Start",
-- data model Part VI `routines`).
--
-- Keyed by (user_id, local_date, type) rather than by a days-row FK, so ticking a routine
-- item never has to create a `days` row first -- the two rituals are independent and the
-- blueprint is explicit that every routine item is optional while only the Start Day tap
-- matters. local_date is supplied by the caller from the user's timezone, as everywhere.

create table public.routines (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  type text not null check (type in ('morning', 'night')),
  -- [{ "key": "treadmill", "done": true }, ...]. The item LIST lives in the app (the
  -- blueprint names the default five); this stores only which were ticked on which day.
  -- jsonb rather than a child table because items are a per-day checklist snapshot, never
  -- queried individually or joined -- the same shape the blueprint specifies.
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date, type),
  constraint routines_items_is_array check (jsonb_typeof(items) = 'array')
);

create index routines_user_date_idx on public.routines (user_id, local_date);

create trigger routines_set_updated_at
  before update on public.routines
  for each row execute function public.set_updated_at();

alter table public.routines enable row level security;
alter table public.routines force row level security;

create policy routines_all_own on public.routines
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
