-- L10: Brightspace iCal sync. Built first among the L10 integrations because it's the
-- only one fully provable tonight -- no OAuth, no credentials, just a real ICS parser
-- (packages/core/src/integrations/icsParser.ts) against real fixture files.
--
-- Extracted academic dates route through the exact same confirmation-gate structure as
-- syllabus_extractions (DATA_MODEL.md §6): a staging table with deliberately NO
-- trigger/FK path into calendar_events. An iCal feed is no more trusted than an LLM
-- extraction -- Brightspace could be misconfigured, a course could get renamed
-- mid-semester with stale UIDs, a recurring lecture's RRULE could be wrong. Nothing in
-- the schema can auto-populate calendar_events from a staged sync; that absence IS the
-- structural enforcement, same reasoning as syllabus_extractions.
create table public.ics_event_extractions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  feed_id bigint not null references public.brightspace_feeds (id) on delete cascade,
  -- The parsed VEVENT's UID, or "uid#recurrenceIndex" for an occurrence expanded from
  -- an RRULE (icsParser.ts's own recurrenceIndex semantics -- several occurrences share
  -- one UID, so UID alone is not a stable per-occurrence key). Unique per feed so a
  -- re-sync updates the same staged row rather than accumulating duplicates.
  external_id text not null,
  summary text not null,
  description text,
  location text,
  start_at timestamptz not null,
  end_at timestamptz,
  is_all_day boolean not null default false,
  -- Best-effort course match (application-layer heuristic against the summary/course
  -- code), corrigible by the user at confirm time -- a suggestion, never trusted as fact.
  course_id bigint references public.courses (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'rejected')),
  confirmed_at timestamptz,
  synced_at timestamptz not null default now(),
  unique (feed_id, external_id)
);

create index ics_event_extractions_user_id_idx on public.ics_event_extractions (user_id);
create index ics_event_extractions_feed_id_idx on public.ics_event_extractions (feed_id);
create index ics_event_extractions_status_idx on public.ics_event_extractions (user_id, status);

alter table public.ics_event_extractions enable row level security;
alter table public.ics_event_extractions force row level security;

create policy ics_event_extractions_all_own on public.ics_event_extractions
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ============================================================================
-- F3 (docs/FOLLOWUPS.md): brightspace_feeds.ics_url moves to Vault. The Lead's earlier
-- ruling stands -- a feed URL grants calendar access by possession, is long-lived, and
-- isn't user-rotatable. That's a bearer credential regardless of mechanism, the same
-- category as an OAuth token even though the delivery mechanism differs. Mirrors
-- oauth_connections' exact pattern (migration 0010): only vault_secret_id lives on the
-- table, two SECURITY DEFINER functions in `private` (not exposed via PostgREST) are
-- the only code paths that ever touch plaintext.
--
-- No existing rows reference ics_url (this integration was never built before tonight),
-- so this is a plain column swap, not a data migration.
-- ============================================================================
alter table public.brightspace_feeds add column vault_secret_id uuid references vault.secrets (id);
alter table public.brightspace_feeds drop column ics_url;
alter table public.brightspace_feeds alter column vault_secret_id set not null;

create or replace function private.store_brightspace_feed_url(p_user_id uuid, p_ics_url text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
  v_feed_id bigint;
begin
  if (select auth.uid()) is distinct from p_user_id and (select auth.role()) <> 'service_role' then
    raise exception 'not authorized';
  end if;

  v_secret_id := vault.create_secret(p_ics_url, 'brightspace_ics:' || p_user_id::text);

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

-- Decrypts and returns the feed URL for the caller's own feed. This is the ONLY path
-- that ever returns plaintext -- the Edge Function that fetches the feed calls this as
-- service_role, never reading a plaintext column directly.
create or replace function private.get_brightspace_feed_url(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
  v_url text;
begin
  if (select auth.uid()) is distinct from p_user_id and (select auth.role()) <> 'service_role' then
    raise exception 'not authorized';
  end if;

  select vault_secret_id into v_secret_id from public.brightspace_feeds where user_id = p_user_id;
  if v_secret_id is null then
    return null;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where id = v_secret_id;
  return v_url;
end;
$$;

revoke execute on function private.get_brightspace_feed_url(uuid) from PUBLIC, anon;
grant execute on function private.get_brightspace_feed_url(uuid) to authenticated, service_role;
