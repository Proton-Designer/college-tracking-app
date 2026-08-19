-- Fixes a real bug found live while building WHOOP's token-refresh path: both
-- private.store_oauth_token (migration 0010) and private.store_brightspace_feed_url
-- (migration 0017) unconditionally called vault.create_secret on every call, including a
-- RE-store for a user+provider that was already connected (a token refresh, or
-- reconnecting a changed feed URL). vault.secrets.name is unique, and both functions used
-- a stable, non-random name (`provider:user_id`) -- so any second call for the same
-- user+provider threw `duplicate key value violates unique constraint "secrets_name_idx"`.
--
-- Worse than the constraint violation itself: even if the name collision were avoided
-- (e.g. by randomizing it), the previous behavior would still leak a Vault secret row on
-- every re-store forever -- oauth_connections.vault_secret_id gets overwritten by the
-- upsert's `excluded.vault_secret_id`, so the OLD secret becomes permanently orphaned
-- (never read, never deleted).
--
-- Fix: if a connection row already exists for (user_id, provider), update that SAME
-- Vault secret in place via vault.update_secret rather than creating a new one. Caught by
-- tokenStore.itest.ts's "re-storing overwrites the prior token" case -- exactly the
-- scenario the original code path had never been exercised against, since no real WHOOP
-- refresh flow existed until tonight and no Brightspace feed had ever been reconnected in
-- a test.

create or replace function private.store_oauth_token(
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
declare
  v_existing_secret_id uuid;
  v_secret_id uuid;
  v_connection_id bigint;
begin
  if (select auth.uid()) is distinct from p_user_id and (select auth.role()) <> 'service_role' then
    raise exception 'not authorized';
  end if;

  select vault_secret_id into v_existing_secret_id
  from public.oauth_connections
  where user_id = p_user_id and provider = p_provider;

  if v_existing_secret_id is not null then
    perform vault.update_secret(v_existing_secret_id, p_token);
    v_secret_id := v_existing_secret_id;
  else
    v_secret_id := vault.create_secret(p_token, p_provider || ':' || p_user_id::text);
  end if;

  insert into public.oauth_connections (user_id, provider, vault_secret_id, scope, expires_at)
  values (p_user_id, p_provider, v_secret_id, p_scope, p_expires_at)
  on conflict (user_id, provider) do update
    set vault_secret_id = excluded.vault_secret_id,
        scope = excluded.scope,
        expires_at = excluded.expires_at,
        status = 'active',
        updated_at = now()
  returning id into v_connection_id;

  return v_connection_id;
end;
$$;

revoke execute on function private.store_oauth_token(uuid, text, text, text, timestamptz)
  from PUBLIC, anon;
grant execute on function private.store_oauth_token(uuid, text, text, text, timestamptz)
  to authenticated, service_role;

create or replace function private.store_brightspace_feed_url(p_user_id uuid, p_ics_url text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing_secret_id uuid;
  v_secret_id uuid;
  v_feed_id bigint;
begin
  if (select auth.uid()) is distinct from p_user_id and (select auth.role()) <> 'service_role' then
    raise exception 'not authorized';
  end if;

  select vault_secret_id into v_existing_secret_id
  from public.brightspace_feeds
  where user_id = p_user_id;

  if v_existing_secret_id is not null then
    perform vault.update_secret(v_existing_secret_id, p_ics_url);
    v_secret_id := v_existing_secret_id;
  else
    v_secret_id := vault.create_secret(p_ics_url, 'brightspace_ics:' || p_user_id::text);
  end if;

  insert into public.brightspace_feeds (user_id, vault_secret_id)
  values (p_user_id, v_secret_id)
  on conflict (user_id) do update
    set vault_secret_id = excluded.vault_secret_id
  returning id into v_feed_id;

  return v_feed_id;
end;
$$;

revoke execute on function private.store_brightspace_feed_url(uuid, text) from PUBLIC, anon;
grant execute on function private.store_brightspace_feed_url(uuid, text) to authenticated, service_role;
