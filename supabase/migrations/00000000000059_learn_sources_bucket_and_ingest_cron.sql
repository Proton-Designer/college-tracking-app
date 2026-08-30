-- Two things migration 54 named but did not create: the bucket its `storage_path` column
-- points into, and the cron that re-drives its state machine.

-- ============================================================================
-- 1. The `sources` storage bucket
-- ============================================================================
--
-- Migration 54 documents `sources.storage_path` as "Path within the private `sources`
-- storage bucket" — a bucket that does not exist, so the ingestion pipeline had nothing
-- to download from. Migration 11's exact pattern: private, owner-prefix path, signed URLs
-- only, and an explicit MIME allowlist.
--
-- 100 MB: a 300-page trade book with a text layer is a few megabytes; a scanned or
-- image-heavy PDF of the same length can reach tens. 100 MB is generous for the
-- legitimate case and still a hard bound on what one upload can cost to store and to
-- stream into a page-range extraction.
--
-- application/pdf ONLY, deliberately, even though `source_kind` already names epub,
-- article, video and course. Migration 54's own comment sets that precedent: the enum
-- exists so the vocabulary is stable, and only 'pdf' has a working extractor today.
-- Allowing an epub upload the pipeline cannot read would produce a source that sits in
-- 'processing' forever — an honest refusal at upload time is better than a job that
-- fails five attempts later.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sources', 'sources', false, 104857600, array['application/pdf'])
on conflict (id) do nothing;

create policy sources_all_own on storage.objects
  for all to authenticated
  using (bucket_id = 'sources' and (select auth.uid())::text = (storage.foldername(name))[1])
  with check (bucket_id = 'sources' and (select auth.uid())::text = (storage.foldername(name))[1]);

-- ============================================================================
-- 2. The ingestion re-driver
-- ============================================================================
--
-- Migration 54's state machine comment: "A cron re-drives anything stalled -- the same
-- shape as the Deepgram flow, adapted to steps." This is that cron.
--
-- D17, applied verbatim — this is migration 14's structure, not a new one:
--
--   * pg_cron availability is guarded by an exception-handling DO block, so a host
--     without it still applies this migration cleanly.
--   * REGISTRATION is gated on the `cron_shared_secret` Vault secret existing. Nothing
--     sets it by default, so **a fresh `npm run db:reset` registers zero jobs** — the
--     property D17 exists to protect, and it matters at least as much here as it did for
--     the nightly job: this cron spends real money at a paid API. A local reset that
--     silently started ingesting every seeded source would bill for it.
--   * The operator opts in with the same three secrets migration 14 documents
--     (docs/SUPABASE_SETUP.md §8); no new secret is introduced.
--
-- Every minute, not nightly. This is a latency mechanism, not a daily batch: a stalled
-- ingestion is a user watching a progress indicator that has stopped. The function itself
-- bounds the work — it advances at most 20 stalled jobs by ONE step each and returns — so
-- a per-minute tick cannot pile up, and a job whose heartbeat is fresh (one is actively
-- being advanced by the self-continuation chain) is not touched at all.
--
-- Timezone: none. Unlike the nightly/weekly jobs, nothing here is about a local day —
-- "this job has not moved in five minutes" is the same statement in every timezone.

do $$
begin
  create extension if not exists pg_cron with schema extensions;
exception when others then
  raise notice 'pg_cron unavailable on this host -- the ingestion re-driver will not run. See docs/SUPABASE_SETUP.md §8.';
end $$;

do $$
declare
  v_pg_cron_present boolean;
  v_secret_present boolean;
begin
  v_pg_cron_present := exists (select 1 from pg_extension where extname = 'pg_cron');
  if not v_pg_cron_present then
    raise notice 'pg_cron not installed -- skipping learn-ingest-redrive registration.';
    return;
  end if;

  v_secret_present := exists (select 1 from vault.decrypted_secrets where name = 'cron_shared_secret');
  if not v_secret_present then
    raise notice 'cron_shared_secret Vault secret not set -- skipping learn-ingest-redrive registration (see docs/SUPABASE_SETUP.md §8 to opt in).';
    return;
  end if;

  perform cron.schedule(
    'learn-ingest-redrive',
    '* * * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_base_url') || '/learn-ingest',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_anon_key'),
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_shared_secret')
      ),
      body := '{"driveAll": true}'::jsonb
    );
    $job$
  );
end $$;
