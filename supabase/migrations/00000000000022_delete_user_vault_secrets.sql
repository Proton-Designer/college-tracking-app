-- Account deletion needs to remove Vault secrets explicitly -- proved live (not assumed)
-- that they orphan otherwise: oauth_connections.vault_secret_id/brightspace_feeds.
-- vault_secret_id reference vault.secrets, but nothing references the other direction, so
-- deleting a profiles row (which cascades away oauth_connections/brightspace_feeds along
-- with everything else) leaves the underlying vault.secrets row sitting there forever with
-- no pointer left to find it by.
--
-- `vault` is not in config.toml's exposed schemas, so it's unreachable via `.rpc()` from
-- any real caller -- same D19 pattern as every other private-schema function: implementation
-- in `private`, a `public` wrapper that re-asserts the same ownership check is what makes
-- it callable at all.
--
-- The 41 real data tables need zero new code for deletion -- they cascade automatically
-- from auth.users via the FK chain already in place (proved live: deleting a user with
-- one row in every user-scoped table left zero rows everywhere, see
-- supabase/tests/database/07_account_deletion.test.sql). Storage objects are the other
-- thing account deletion must handle explicitly, but that goes through the Storage API
-- from the Edge Function, not SQL -- storage.objects has a protect_delete() trigger
-- blocking direct deletes (see .brain/memory/tooling-gotchas.md) and no FK to auth.users
-- to cascade through in the first place.
--
-- Second real bug found live while wiring this up: brightspace_feeds.vault_secret_id
-- (migration 0017) references vault.secrets with NO on-delete clause (default RESTRICT),
-- unlike oauth_connections.vault_secret_id (migration 0010), which IS `on delete
-- cascade`. Attempting to delete a vault secret still referenced by a brightspace_feeds
-- row threw a foreign-key violation instead of cleaning up -- caught immediately by
-- actually running the delete against a real fixture rather than assuming symmetry with
-- oauth_connections. Fixed below by aligning the constraint.
alter table public.brightspace_feeds drop constraint brightspace_feeds_vault_secret_id_fkey;
alter table public.brightspace_feeds
  add constraint brightspace_feeds_vault_secret_id_fkey
  foreign key (vault_secret_id) references vault.secrets (id) on delete cascade;

create or replace function private.delete_user_vault_secrets(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_count bigint;
begin
  if (select auth.uid()) is distinct from p_user_id and (select auth.role()) <> 'service_role' then
    raise exception 'not authorized';
  end if;

  with secret_ids as (
    select vault_secret_id from public.oauth_connections where user_id = p_user_id
    union
    select vault_secret_id from public.brightspace_feeds where user_id = p_user_id
  ),
  deleted as (
    delete from vault.secrets
    where id in (select vault_secret_id from secret_ids)
    returning id
  )
  select count(*) into v_deleted_count from deleted;

  return v_deleted_count;
end;
$$;

revoke execute on function private.delete_user_vault_secrets(uuid) from PUBLIC, anon;
grant execute on function private.delete_user_vault_secrets(uuid) to authenticated, service_role;

create or replace function public.delete_user_vault_secrets(p_user_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is distinct from p_user_id and (select auth.role()) <> 'service_role' then
    raise exception 'not authorized';
  end if;
  return private.delete_user_vault_secrets(p_user_id);
end;
$$;

revoke execute on function public.delete_user_vault_secrets(uuid) from PUBLIC, anon;
grant execute on function public.delete_user_vault_secrets(uuid) to authenticated, service_role;
