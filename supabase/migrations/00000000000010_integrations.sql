-- Integrations cluster: OAuth-connected sources (WHOOP, calendar providers, RescueTime)
-- and the Brightspace iCal feed subscription. L10 clients aren't built yet, but the
-- storage contract is -- see docs/MASTER_PLAN.md §5.

-- `private` is not in config.toml's exposed `schemas` list, so nothing in it is reachable
-- via PostgREST -- the standard pattern for SECURITY DEFINER helpers that must never be
-- callable directly by a client with just an anon/authenticated key.
create schema if not exists private;
grant usage on schema private to authenticated, service_role;

-- ============================================================================
-- oauth_connections: tokens live in Supabase Vault, never in a plaintext column on this
-- table -- constraint #6. This table stores only the vault secret reference and metadata.
-- ============================================================================
create table public.oauth_connections (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('whoop', 'google_calendar', 'microsoft', 'rescuetime')),
  vault_secret_id uuid not null references vault.secrets (id) on delete cascade,
  scope text,
  connected_at timestamptz not null default now(),
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active', 'expired', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create index oauth_connections_user_id_idx on public.oauth_connections (user_id);

create trigger oauth_connections_set_updated_at
  before update on public.oauth_connections
  for each row execute function public.set_updated_at();

alter table public.oauth_connections enable row level security;
alter table public.oauth_connections force row level security;

-- Metadata only (provider, status, expiry) is directly selectable; the token itself is
-- never exposed through this table and can only be read via private.get_oauth_token.
create policy oauth_connections_all_own on public.oauth_connections
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Stores a token in Vault and upserts the connection row. Runs as the Edge Function's
-- service_role in practice, but is safe to call as an authenticated user too since it
-- checks the caller owns p_user_id.
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
  v_secret_id uuid;
  v_connection_id bigint;
begin
  if (select auth.uid()) is distinct from p_user_id and (select auth.role()) <> 'service_role' then
    raise exception 'not authorized';
  end if;

  v_secret_id := vault.create_secret(p_token, p_provider || ':' || p_user_id::text);

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

-- Decrypts and returns the token for the caller's own connection. This is the ONLY
-- path that ever returns plaintext.
create or replace function private.get_oauth_token(p_user_id uuid, p_provider text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
  v_token text;
begin
  if (select auth.uid()) is distinct from p_user_id and (select auth.role()) <> 'service_role' then
    raise exception 'not authorized';
  end if;

  select vault_secret_id into v_secret_id
  from public.oauth_connections
  where user_id = p_user_id and provider = p_provider and status = 'active';

  if v_secret_id is null then
    return null;
  end if;

  select decrypted_secret into v_token from vault.decrypted_secrets where id = v_secret_id;
  return v_token;
end;
$$;

revoke execute on function private.get_oauth_token(uuid, text) from PUBLIC, anon;
grant execute on function private.get_oauth_token(uuid, text) to authenticated, service_role;

-- ============================================================================
-- brightspace_feeds: iCal feed URL, one per user. Stored plaintext -- it is a
-- capability URL, not an OAuth bearer token, so it does not go through Vault. Flagged in
-- docs/DATA_MODEL.md as worth revisiting if Purdue's feed URLs prove to embed a durable
-- credential rather than an unguessable-but-revocable link.
-- ============================================================================
create table public.brightspace_feeds (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  ics_url text not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id)
);

create index brightspace_feeds_user_id_idx on public.brightspace_feeds (user_id);

alter table public.brightspace_feeds enable row level security;
alter table public.brightspace_feeds force row level security;

create policy brightspace_feeds_all_own on public.brightspace_feeds
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
