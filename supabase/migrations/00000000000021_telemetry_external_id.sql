-- Webhook-triggered ingest (WHOOP) must be idempotent on retry: a provider that doesn't
-- get a fast 2xx resends the same notification, and the fetch-then-ingest path this
-- enables must not double-write telemetry_events for the same underlying resource.
-- Mirrors calendar_events' external_id + partial unique dedup index (migration 0008)
-- exactly -- same problem (an external system's retry semantics meeting our insert path),
-- same fix.
alter table public.telemetry_events add column external_id text;

create unique index telemetry_events_external_dedup_idx
  on public.telemetry_events (user_id, source, metric, external_id)
  where external_id is not null;
