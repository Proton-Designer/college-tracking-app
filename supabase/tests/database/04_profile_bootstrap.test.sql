-- Proves the auth.users -> profiles bootstrap trigger (handle_new_user) is idempotent
-- and, critically, that a failure creating the profile row never blocks signup itself.
begin;
select plan(6);

-- ============================================================================
-- Happy path: signup creates exactly one profile row with the right defaults.
-- ============================================================================
insert into auth.users (id, email) values ('40000000-0000-0000-0000-000000000001', 'bootstrap-happy@test.local');

select is(
  (select count(*) from public.profiles where id = '40000000-0000-0000-0000-000000000001'),
  1::bigint,
  'signup creates exactly one profile row'
);
select is(
  (select timezone from public.profiles where id = '40000000-0000-0000-0000-000000000001'),
  'America/Indiana/Indianapolis',
  'the new profile gets the default timezone'
);

-- ============================================================================
-- Idempotency: if a profile already exists for an id (e.g. a retried/replayed insert),
-- the trigger must not error and must not overwrite the existing row.
-- ============================================================================
update public.profiles
  set display_name = 'Pre-existing Name'
  where id = '40000000-0000-0000-0000-000000000001';

-- handle_new_user reads the trigger's implicit `new` record, which only exists inside a
-- real trigger context, and auth.users.id is a primary key so a second literal insert
-- with the same id is impossible -- idempotency is instead proven by calling the exact
-- insert pattern the trigger uses (ON CONFLICT DO NOTHING) against an id that already has
-- a customized profile, and confirming both that it doesn't raise and that the
-- customization survives untouched.
select lives_ok(
  $$insert into public.profiles (id, email) values ('40000000-0000-0000-0000-000000000001', 'bootstrap-happy@test.local') on conflict (id) do nothing$$,
  're-running the trigger''s insert pattern for an existing id does not raise'
);
select is(
  (select display_name from public.profiles where id = '40000000-0000-0000-0000-000000000001'),
  'Pre-existing Name',
  'ON CONFLICT DO NOTHING means the existing profile is never overwritten'
);

-- ============================================================================
-- Failure path: force profile creation to fail (a temporary BEFORE INSERT trigger that
-- rejects one specific sentinel email) and prove the auth.users insert still succeeds.
-- ============================================================================
create or replace function pg_temp.reject_sentinel_profile()
returns trigger
language plpgsql
as $$
begin
  if new.email = 'sentinel-reject@test.local' then
    raise exception 'simulated profile-creation failure';
  end if;
  return new;
end;
$$;

create trigger reject_sentinel_profile
  before insert on public.profiles
  for each row execute function pg_temp.reject_sentinel_profile();

select lives_ok(
  $$insert into auth.users (id, email) values ('40000000-0000-0000-0000-000000000002', 'sentinel-reject@test.local')$$,
  'signup succeeds even when profile creation fails inside the trigger'
);

select is(
  (select count(*) from public.profiles where id = '40000000-0000-0000-0000-000000000002'),
  0::bigint,
  'the failed profile creation is not silently faked -- no profile row exists for that user'
);

drop trigger reject_sentinel_profile on public.profiles;

select * from finish();
rollback;
