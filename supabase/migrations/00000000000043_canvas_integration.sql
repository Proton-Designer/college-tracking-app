-- I1 / Canvas conversion (docs/CANVAS_AUDIT.md). The REST-poll half's schema: the token
-- lives in oauth_connections (Vault, F3 -- a PAT is a bearer credential regardless of
-- not being OAuth), the base URL + poll watermark live here, and the course mapping is
-- user-confirmed rows, never a silent fuzzy match ("which course said this" is not
-- recoverable from prose -- migration 39's own reasoning, applied at connect time).
--
-- The ICS half deliberately adds NOTHING: the Canvas per-user calendar feed connects
-- through the existing brightspace pipeline (audit §3 -- parser, SSRF guard, Vault URL
-- storage and staged confirm are all host-agnostic).

-- 1. The provider CHECK gains 'canvas' (audit finding §2). Text + CHECK per the enum
-- policy; the constraint carries migration 10's inline auto-name.
alter table public.oauth_connections
  drop constraint oauth_connections_provider_check;
alter table public.oauth_connections
  add constraint oauth_connections_provider_check
  check (provider in ('whoop', 'google_calendar', 'microsoft', 'rescuetime', 'canvas'));

-- 2. Announcements learn where they came from. The paste flow never needed an external
-- id; a poll re-fetching a time window MUST dedupe on one or every poll re-stages the
-- same rows. Partial unique: pasted rows have no external identity and never collide.
alter table public.announcements
  add column source text not null default 'paste'
    check (source in ('paste', 'canvas')),
  add column external_id text;

create unique index announcements_user_external_id_key
  on public.announcements (user_id, external_id)
  where external_id is not null;

comment on column public.announcements.external_id is
  'Canvas discussion-topic id for polled announcements (dedupe key per user); null for pasted ones.';

-- 3. The connection record. base_url is NOT a credential (the host is public knowledge);
-- the PAT that authorizes against it is in oauth_connections/Vault. https is enforced
-- here as defense in depth -- the edge function SSRF-guards before every fetch as well.
create table public.canvas_connections (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  base_url text not null,
  -- Poll watermark: the instant the last successful announcements poll ran. Null until
  -- the first poll. The poll window is [last_polled_at - overlap, now] -- overlap
  -- handled in code, because a clock is not a transaction log.
  last_polled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id),
  constraint canvas_connections_base_url_https check (base_url like 'https://%')
);

create trigger canvas_connections_set_updated_at
  before update on public.canvas_connections
  for each row execute function public.set_updated_at();

alter table public.canvas_connections enable row level security;
alter table public.canvas_connections force row level security;

create policy canvas_connections_all_own on public.canvas_connections
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 4. The course mapping, confirmed by the user from the fetched Canvas course list.
-- Both directions unique: one local course maps to at most one Canvas course and vice
-- versa. canvas_course_name is display-only (what the picker showed when the user chose).
create table public.canvas_course_links (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  course_id bigint not null references public.courses (id) on delete cascade,
  canvas_course_id bigint not null,
  canvas_course_name text not null,
  created_at timestamptz not null default now(),
  unique (user_id, course_id),
  unique (user_id, canvas_course_id)
);

create index canvas_course_links_user_id_idx on public.canvas_course_links (user_id);

alter table public.canvas_course_links enable row level security;
alter table public.canvas_course_links force row level security;

create policy canvas_course_links_all_own on public.canvas_course_links
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- 5. The poll cron, same Vault-gated registration as migration 14 (D17: gated on the
-- secret existing, not on extension availability). Hourly, every day -- inside the
-- blueprint's 30-60 min school-day band on weekdays, and professors post on Sundays;
-- an hourly no-op poll costs one HTTP round-trip. The function itself iterates
-- connected users as service_role and exits fast when there are none.
do $$
declare
  v_pg_cron_present boolean;
  v_secret_present boolean;
begin
  v_pg_cron_present := exists (select 1 from pg_extension where extname = 'pg_cron');
  if not v_pg_cron_present then
    raise notice 'pg_cron not installed -- skipping canvas-sync schedule registration.';
    return;
  end if;

  v_secret_present := exists (select 1 from vault.decrypted_secrets where name = 'cron_shared_secret');
  if not v_secret_present then
    raise notice 'cron_shared_secret Vault secret not set -- skipping canvas-sync schedule registration (see docs/SUPABASE_SETUP.md §8 to opt in).';
    return;
  end if;

  perform cron.schedule(
    'canvas-sync-poll',
    '15 * * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_base_url') || '/canvas-sync',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_anon_key'),
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_shared_secret')
      ),
      body := '{"pollAll":true}'::jsonb
    );
    $job$
  );
end $$;
