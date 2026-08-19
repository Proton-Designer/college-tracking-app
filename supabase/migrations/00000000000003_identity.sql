-- profiles: one row per auth.users row. The durable per-user profile that everything
-- else hangs off (timezone, budget ceiling, physiological baseline).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- Denormalized from auth.users for display convenience only. Never used for
  -- authorization -- auth decisions always go through Supabase Auth directly, and this
  -- copy is refreshed on signup but not kept in sync on later email changes.
  email text not null,
  display_name text,
  -- IANA timezone name. NOT NULL: every local_date computation in this schema depends on
  -- it. Default reflects the demo user's location (Purdue / Indiana, which is why it's
  -- the specific historically-DST-quirky zone rather than a generic US zone).
  timezone text not null default 'America/Indiana/Indianapolis',
  -- Rolling personal sleep baseline in hours, used by the Recovery Mode trigger (§6).
  -- Null until enough check-in history establishes one -- packages/core treats a null
  -- baseline as "insufficient data" for that signal, never a fabricated default.
  sleep_baseline_hours numeric(4, 2),
  llm_monthly_budget_usd numeric(8, 2) not null default 5.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_timezone_not_blank check (btrim(timezone) <> ''),
  constraint profiles_budget_positive check (llm_monthly_budget_usd > 0),
  constraint profiles_sleep_baseline_range
    check (sleep_baseline_hours is null or sleep_baseline_hours between 0 and 24)
);

comment on table public.profiles is
  'One row per authenticated user. Durable profile: timezone (the anchor for every '
  'local_date in this schema), LLM budget ceiling, physiological baseline.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.profiles force row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

-- Auto-create a profile row on signup so every downstream FK to profiles(id) can rely on
-- one existing. SECURITY DEFINER because it writes to public.profiles as a trigger on
-- auth.users, which the authenticating role cannot write to directly.
--
-- Idempotent (ON CONFLICT DO NOTHING: firing again for an id that already has a profile
-- is a no-op, never an overwrite) and defensive: any unexpected failure creating the
-- profile is caught and logged rather than propagated, because propagating it would
-- roll back the enclosing auth.users insert -- signup itself must never be blocked by
-- this trigger. See supabase/tests/database/04_profile_bootstrap.test.sql.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into public.profiles (id, email)
    values (new.id, new.email)
    on conflict (id) do nothing;
  exception when others then
    raise warning 'handle_new_user: failed to create profile for user %: %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
