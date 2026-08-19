-- Settings §4 (integrations) needs a real disconnect action, not just connect. Deleting
-- the row alone would leave the underlying Vault secret orphaned -- same reasoning
-- migration 0022 documents for account deletion. Deleting the vault.secrets row instead
-- cascades away the oauth_connections row automatically (on delete cascade, migration
-- 0010), so one delete does both.
--
-- D19 pattern: `private` is unreachable via PostgREST, so a `public` wrapper re-asserting
-- the same ownership check is what makes this callable from a real client at all.
create or replace function private.disconnect_oauth_connection(p_user_id uuid, p_provider text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
begin
  if (select auth.uid()) is distinct from p_user_id and (select auth.role()) <> 'service_role' then
    raise exception 'not authorized';
  end if;

  select vault_secret_id into v_secret_id
  from public.oauth_connections
  where user_id = p_user_id and provider = p_provider;

  if v_secret_id is null then
    return false;
  end if;

  delete from vault.secrets where id = v_secret_id;
  return true;
end;
$$;

revoke execute on function private.disconnect_oauth_connection(uuid, text) from PUBLIC, anon;
grant execute on function private.disconnect_oauth_connection(uuid, text) to authenticated, service_role;

create or replace function public.disconnect_oauth_connection(p_user_id uuid, p_provider text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is distinct from p_user_id and (select auth.role()) <> 'service_role' then
    raise exception 'not authorized';
  end if;
  return private.disconnect_oauth_connection(p_user_id, p_provider);
end;
$$;

revoke execute on function public.disconnect_oauth_connection(uuid, text) from PUBLIC, anon;
grant execute on function public.disconnect_oauth_connection(uuid, text) to authenticated, service_role;
