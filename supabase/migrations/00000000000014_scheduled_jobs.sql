-- L7 item 6: scheduled nightly analysis + weekly synthesis, via pg_cron calling the
-- nightly-analysis/weekly-synthesis Edge Functions through pg_net.
--
-- Two independent guards, for two independent reasons:
--
-- 1. pg_cron availability. Not every Postgres host has it (or allows enabling it) --
--    wrapped in an exception-handling DO block so a host without it doesn't fail this
--    migration; every table/function above and below this file still applies cleanly.
--    (Verified live against this project's own local stack: pg_cron IS available and
--    DOES actually schedule and fire jobs here, contradicting an earlier, unverified
--    assumption recorded in docs/SUPABASE_SETUP.md that it wasn't present locally --
--    corrected in that doc alongside this migration.)
--
-- 2. Whether the jobs get REGISTERED at all -- gated on the `cron_shared_secret` Vault
--    secret already existing (checked by name, not by cron.job_run_details -- the
--    absence of a schedule at apply time IS the guard, not a later failed run). This is
--    deliberate, independent of guard 1: even where pg_cron works fine (proven true for
--    local dev), nobody has run `select vault.create_secret(...)` for a fresh local
--    stack, so registering a real schedule unconditionally would mean every
--    `npm run db:reset` starts silently firing nightly/weekly jobs against every seeded
--    profile -- including demo@collegeos.app, whose entire value is its stable, curated,
--    screenshot-worthy semester data (see the focus-session and report-verification
--    cleanup notes elsewhere in this session's history: writes to demo are never free).
--    An operator opts in explicitly by setting the secret -- see docs/SUPABASE_SETUP.md
--    §8 for the exact command, and the cloud verification checklist that follows it.
--
-- Timezone: CLAUDE.md's rule -- this product is about local days, never derive a day
-- boundary from UTC. The schedule below fires once, in UTC, but nightly-analysis/
-- weekly-synthesis internally compute EACH USER'S OWN last-completed local day from
-- their profile.timezone (addDays(localDateFromInstant(now, tz), -1)) -- never a single
-- shared date. So the UTC firing hour only needs to be late enough that every timezone
-- in active use has already crossed its own local midnight for the target day; it is
-- not itself a per-user value. 12:00 UTC (noon) is chosen deliberately as the latest
-- point in the day: UTC-12 (the westmost real offset in use, e.g. Baker Island -- not
-- realistically a user timezone, but the true edge of the range) crosses local midnight
-- exactly at 12:00 UTC, so this is the first UTC hour by which literally every
-- real-world timezone has started its new local day. Weekly runs once, the following
-- Monday at the same hour, synthesizing the 7 days ending on each user's last-completed
-- local day (mirroring the nightly job's own date math, not a fixed UTC week boundary).

do $$
begin
  create extension if not exists pg_cron with schema extensions;
exception when others then
  raise notice 'pg_cron unavailable on this host -- scheduled jobs will not run. See docs/SUPABASE_SETUP.md §8.';
end $$;

do $$
declare
  v_pg_cron_present boolean;
  v_secret_present boolean;
begin
  v_pg_cron_present := exists (select 1 from pg_extension where extname = 'pg_cron');
  if not v_pg_cron_present then
    raise notice 'pg_cron not installed -- skipping schedule registration.';
    return;
  end if;

  v_secret_present := exists (select 1 from vault.decrypted_secrets where name = 'cron_shared_secret');
  if not v_secret_present then
    raise notice 'cron_shared_secret Vault secret not set -- skipping schedule registration (see docs/SUPABASE_SETUP.md §8 to opt in).';
    return;
  end if;

  perform cron.schedule(
    'nightly-analysis',
    '0 12 * * *',
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_base_url') || '/nightly-analysis',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_anon_key'),
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_shared_secret')
      ),
      body := '{}'::jsonb
    );
    $job$
  );

  perform cron.schedule(
    'weekly-synthesis',
    '0 12 * * 1', -- Mondays, same UTC hour and reasoning as nightly-analysis above
    $job$
    select net.http_post(
      url := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_base_url') || '/weekly-synthesis',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'edge_functions_anon_key'),
        'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_shared_secret')
      ),
      body := '{}'::jsonb
    );
    $job$
  );
end $$;
