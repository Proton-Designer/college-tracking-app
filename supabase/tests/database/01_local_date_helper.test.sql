-- Proves public.local_date() handles the two places these bugs actually live:
-- a DST transition day, and a user near the international date line.
begin;
select plan(8);

-- ============================================================================
-- DST transition: America/Indiana/Indianapolis (Eastern) springs forward on
-- 2026-03-08 at 2:00am local (07:00 UTC), jumping to 3:00am EDT (UTC-4).
-- Before the transition the correct offset is EST (UTC-5); after, it's EDT (UTC-4).
-- A naive implementation that hard-codes one offset instead of using the IANA zone
-- would get the date wrong for instants in the hour surrounding the jump.
-- ============================================================================
select is(
  public.local_date('2026-03-08 04:59:00+00'::timestamptz, 'America/Indiana/Indianapolis'),
  '2026-03-07'::date,
  'just before spring-forward: 04:59 UTC is still 23:59 EST on Mar 7'
);

select is(
  public.local_date('2026-03-08 07:01:00+00'::timestamptz, 'America/Indiana/Indianapolis'),
  '2026-03-08'::date,
  'just after spring-forward: 07:01 UTC is 03:01 EDT on Mar 8'
);

-- Fall-back: 2026-11-01 at 2:00am EDT (06:00 UTC) becomes 1:00am EST.
select is(
  public.local_date('2026-11-01 05:59:00+00'::timestamptz, 'America/Indiana/Indianapolis'),
  '2026-11-01'::date,
  'just before fall-back: 05:59 UTC is 01:59 EDT on Nov 1'
);

select is(
  public.local_date('2026-11-01 06:01:00+00'::timestamptz, 'America/Indiana/Indianapolis'),
  '2026-11-01'::date,
  'just after fall-back: 06:01 UTC is 01:01 EST, still Nov 1'
);

-- A trigger-derived local_date column must show the same correctness, not just the
-- bare function -- prove it through an actual insert on a real table.
insert into auth.users (id, email) values ('10000000-0000-0000-0000-000000000001', 'dst@test.local');
update public.profiles set timezone = 'America/Indiana/Indianapolis'
  where id = '10000000-0000-0000-0000-000000000001';

with h as (
  insert into public.kill_habits (user_id, name)
  values ('10000000-0000-0000-0000-000000000001', 'DST test habit')
  returning id
)
insert into public.kill_events (user_id, kill_habit_id, occurred_at, outcome)
select '10000000-0000-0000-0000-000000000001', h.id, '2026-03-08 04:59:00+00', 'resisted' from h;

select is(
  (select local_date from public.kill_events
    join public.kill_habits on kill_habits.id = kill_events.kill_habit_id
    where kill_habits.name = 'DST test habit'),
  '2026-03-07'::date,
  'kill_events.local_date trigger matches the DST-aware function, not a naive offset'
);

-- ============================================================================
-- International date line: Pacific/Kiritimati is UTC+14, one of the earliest zones in
-- the world. An instant can be "tomorrow" locally while still "today" in UTC, and a
-- signed-offset bug (assuming offsets never exceed +/-12h) would get this wrong.
-- ============================================================================
select is(
  public.local_date('2026-01-01 09:00:00+00'::timestamptz, 'Pacific/Kiritimati'),
  '2026-01-01'::date,
  'Kiritimati (UTC+14): 09:00 UTC is 23:00 local, still Jan 1'
);

select is(
  public.local_date('2026-01-01 11:00:00+00'::timestamptz, 'Pacific/Kiritimati'),
  '2026-01-02'::date,
  'Kiritimati (UTC+14): 11:00 UTC is 01:00 local the NEXT day, Jan 2'
);

-- Pacific/Niue is UTC-11, one of the last zones -- symmetric check on the other side.
select is(
  public.local_date('2026-01-01 05:00:00+00'::timestamptz, 'Pacific/Niue'),
  '2025-12-31'::date,
  'Niue (UTC-11): 05:00 UTC Jan 1 is 18:00 local the PREVIOUS day, Dec 31'
);

select * from finish();
rollback;
