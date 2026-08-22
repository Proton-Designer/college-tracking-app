-- L14 §4 finding: 03_rls_cross_user_isolation.test.sql's per-table loop only enumerates
-- tables WHERE c.relrowsecurity = true already -- a table shipped with RLS never enabled
-- at all is invisible to it, not caught. CLAUDE.md states "adding a table without a
-- policy is a security bug, not a TODO", and the guard meant to enforce that could not
-- have detected the exact failure it exists to catch. Same class as check:demo-clean's
-- RAISE NOTICE-to-stderr bug: a green check proving nothing.
--
-- This test enumerates EVERY base table in `public` from pg_class directly (no
-- relrowsecurity filter in the WHERE clause) and asserts both relrowsecurity and
-- relforcerowsecurity for each -- forced, not just enabled, matching what 03's isolation
-- test actually relies on (a table owner/superuser-adjacent role bypassing RLS would
-- defeat the isolation proof even with RLS "on").
begin;
select no_plan();

create or replace function pg_temp.check_rls_universal()
returns setof text
language plpgsql
as $$
declare
  r record;
begin
  for r in
    select c.relname as table_name, c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
    order by c.relname
  loop
    return next ok(r.rls_enabled, format('%s: row level security is enabled', r.table_name));
    return next ok(r.rls_forced, format('%s: row level security is FORCED (applies even to the table owner)', r.table_name));
  end loop;
end;
$$;

select * from pg_temp.check_rls_universal();

-- Sanity floor: fail loudly if the enumeration itself silently returned nothing (e.g. a
-- future schema-search-path change), rather than passing vacuously with zero assertions.
select ok(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r') >= 40,
  'sanity: the public schema still has a substantial number of base tables to check (guards against enumerating zero)'
);

select * from finish();
rollback;
