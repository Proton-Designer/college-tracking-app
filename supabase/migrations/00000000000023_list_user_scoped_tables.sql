-- account-export needs to enumerate every user-scoped table the SAME way the pgTAP
-- tests already do (dynamically, via catalog metadata) so a future table is
-- automatically included rather than needing a second hardcoded list to remember --
-- same reasoning as 07_account_deletion.test.sql's assert_zero_rows_everywhere.
--
-- An Edge Function has no raw SQL access (PostgREST only), so this is a small SQL
-- function the Edge Function calls via .rpc() to get that list at runtime. No `private`
-- wrapper needed and no per-user authorization check -- this returns only PUBLIC SCHEMA
-- METADATA (table names), identical for every caller and already visible via the REST
-- API's own schema introspection; it reveals nothing about any user's data.
create or replace function public.list_user_scoped_tables()
returns setof text
language sql
stable
security invoker
set search_path = ''
as $$
  select c.relname
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and exists (
      select 1 from information_schema.columns col
      where col.table_schema = 'public' and col.table_name = c.relname and col.column_name = 'user_id'
    )
  order by c.relname;
$$;

grant execute on function public.list_user_scoped_tables() to authenticated, service_role;
