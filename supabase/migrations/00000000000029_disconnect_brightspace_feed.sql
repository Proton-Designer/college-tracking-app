-- Settings §4 needs a real Brightspace disconnect, same reasoning as migration 0028 for
-- oauth_connections: deleting the underlying Vault secret cascades away the
-- brightspace_feeds row (vault_secret_id references vault.secrets on delete cascade,
-- migration 0022's fix), so one delete does both and no stale iCal URL is left in Vault.
create or replace function private.disconnect_brightspace_feed(p_user_id uuid)
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
  from public.brightspace_feeds
  where user_id = p_user_id;

  if v_secret_id is null then
    return false;
  end if;

  delete from vault.secrets where id = v_secret_id;
  return true;
end;
$$;

revoke execute on function private.disconnect_brightspace_feed(uuid) from PUBLIC, anon;
grant execute on function private.disconnect_brightspace_feed(uuid) to authenticated, service_role;

create or replace function public.disconnect_brightspace_feed(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is distinct from p_user_id and (select auth.role()) <> 'service_role' then
    raise exception 'not authorized';
  end if;
  return private.disconnect_brightspace_feed(p_user_id);
end;
$$;

revoke execute on function public.disconnect_brightspace_feed(uuid) from PUBLIC, anon;
grant execute on function public.disconnect_brightspace_feed(uuid) to authenticated, service_role;
