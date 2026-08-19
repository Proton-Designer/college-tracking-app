-- packages/api's kill_events/friction_logs inserts pass an obviously-wrong sentinel
-- ('1970-01-01') for local_date, because the column is NOT NULL with no DB default --
-- only a BEFORE INSERT trigger (sync_local_date_from_occurred_at) fills in the real
-- value from occurred_at + the user's timezone. That's only safe as long as the trigger
-- is actually there and actually runs. If it were ever dropped or disabled, 1970 dates
-- would flow silently into real data and only surface as bizarre history months later --
-- this test makes that failure loud (a broken pgTAP run) instead of silent.
begin;
select plan(4);

insert into auth.users (id, email) values ('10000000-0000-0000-0000-000000000099', 'sentinel@test.local');
update public.profiles set timezone = 'America/Indiana/Indianapolis'
  where id = '10000000-0000-0000-0000-000000000099';

-- ============================================================================
-- kill_events: insert with the exact sentinel packages/api/src/data/killEvents.ts uses,
-- at an instant chosen so the correct local date genuinely differs from the sentinel.
-- ============================================================================
with h as (
  insert into public.kill_habits (user_id, name)
  values ('10000000-0000-0000-0000-000000000099', 'sentinel test habit')
  returning id
)
insert into public.kill_events (user_id, kill_habit_id, occurred_at, outcome, local_date)
select '10000000-0000-0000-0000-000000000099', h.id, '2026-06-15 12:00:00+00', 'resisted', '1970-01-01'::date from h;

select isnt(
  (select local_date from public.kill_events
    join public.kill_habits on kill_habits.id = kill_events.kill_habit_id
    where kill_habits.name = 'sentinel test habit'),
  '1970-01-01'::date,
  'kill_events.local_date trigger overwrites the 1970-01-01 sentinel, not leaves it in place'
);

select is(
  (select local_date from public.kill_events
    join public.kill_habits on kill_habits.id = kill_events.kill_habit_id
    where kill_habits.name = 'sentinel test habit'),
  '2026-06-15'::date,
  'kill_events.local_date is the real Eastern-time date for the occurred_at instant'
);

-- ============================================================================
-- friction_logs: same trigger, same sentinel, independently proven -- a fix to one
-- table''s trigger wiring must never be assumed to cover the other.
-- ============================================================================
insert into public.friction_logs (user_id, occurred_at, cause, local_date)
values ('10000000-0000-0000-0000-000000000099', '2026-06-15 12:00:00+00', 'distracted', '1970-01-01'::date);

select isnt(
  (select local_date from public.friction_logs where user_id = '10000000-0000-0000-0000-000000000099'),
  '1970-01-01'::date,
  'friction_logs.local_date trigger overwrites the 1970-01-01 sentinel, not leaves it in place'
);

select is(
  (select local_date from public.friction_logs where user_id = '10000000-0000-0000-0000-000000000099'),
  '2026-06-15'::date,
  'friction_logs.local_date is the real Eastern-time date for the occurred_at instant'
);

select * from finish();
rollback;
