-- Public wrapper functions for the `private` schema's Vault-backed secret functions.
--
-- Discovered live: `config.toml`'s exposed-schemas list (`["public", "graphql_public"]`)
-- means `private.*` functions are NEVER reachable via supabase-js's `.rpc()` -- not from
-- the browser, not mobile, not an Edge Function using anon or service_role through the
-- REST API. `private.store_oauth_token`/`private.get_oauth_token` (migration 0010) and
-- their Brightspace analogues (migration 0017) were proven correct at the database
-- level by pgTAP, but had zero real application call path -- a real gap, not caught
-- earlier only because WHOOP OAuth was never actually built against them.
--
-- The Lead's ruling: `private` schemas hold implementations; a `public` wrapper is how
-- one becomes callable, and adding a wrapper is a DELIBERATE, per-function security
-- decision, not a schema-wide toggle (rejected: exposing `private` wholesale, which
-- would make every future function added there RPC-reachable by default without anyone
-- deciding it should be; rejected: a direct Postgres connection from the Edge Function,
-- which creates a second data-access path with different auth semantics and its own
-- pooling/secret-management cost for no real benefit here).
--
-- Every wrapper below:
--   1. Is SECURITY DEFINER with `set search_path = ''` and fully-qualifies every
--      referenced object -- an unpinned search_path on a SECURITY DEFINER function is a
--      privilege-escalation vector (a caller could shadow a referenced name and run
--      their own code as the definer).
--   2. Re-asserts the SAME authorization check the private function underneath already
--      makes -- never merely delegates and assumes the check happened. The boundary
--      must hold on its own, same principle as the syllabus confirmation gate.
--   3. Is REVOKE ALL FROM PUBLIC, anon by default, then explicitly GRANT EXECUTE to
--      only the roles that have a real reason to call it.

create or replace function public.store_oauth_token(
  p_user_id uuid,
  p_provider text,
  p_token text,
  p_scope text default null,
  p_expires_at timestamptz default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is distinct from p_user_id and (select auth.role()) <> 'service_role' then
    raise exception 'not authorized';
  end if;
  return private.store_oauth_token(p_user_id, p_provider, p_token, p_scope, p_expires_at);
end;
$$;

revoke execute on function public.store_oauth_token(uuid, text, text, text, timestamptz) from PUBLIC, anon;
grant execute on function public.store_oauth_token(uuid, text, text, text, timestamptz) to authenticated, service_role;

create or replace function public.get_oauth_token(p_user_id uuid, p_provider text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is distinct from p_user_id and (select auth.role()) <> 'service_role' then
    raise exception 'not authorized';
  end if;
  return private.get_oauth_token(p_user_id, p_provider);
end;
$$;

revoke execute on function public.get_oauth_token(uuid, text) from PUBLIC, anon;
grant execute on function public.get_oauth_token(uuid, text) to authenticated, service_role;

create or replace function public.store_brightspace_feed_url(p_user_id uuid, p_ics_url text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is distinct from p_user_id and (select auth.role()) <> 'service_role' then
    raise exception 'not authorized';
  end if;
  return private.store_brightspace_feed_url(p_user_id, p_ics_url);
end;
$$;

revoke execute on function public.store_brightspace_feed_url(uuid, text) from PUBLIC, anon;
grant execute on function public.store_brightspace_feed_url(uuid, text) to authenticated, service_role;

create or replace function public.get_brightspace_feed_url(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is distinct from p_user_id and (select auth.role()) <> 'service_role' then
    raise exception 'not authorized';
  end if;
  return private.get_brightspace_feed_url(p_user_id);
end;
$$;

revoke execute on function public.get_brightspace_feed_url(uuid) from PUBLIC, anon;
grant execute on function public.get_brightspace_feed_url(uuid) to authenticated, service_role;
