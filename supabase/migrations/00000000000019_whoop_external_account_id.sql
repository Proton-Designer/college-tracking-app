-- WHOOP webhooks identify the affected account by WHOOP's own user id, not ours -- there
-- is no user JWT on an incoming webhook request to resolve identity from. This column is
-- captured once at OAuth connect time (via WhoopOAuthProvider.getAuthenticatedUserId) and
-- is the only way whoop-webhook can map an inbound notification back to a profile.
--
-- Nullable and provider-agnostic (not WHOOP-specific in name) since any future
-- webhook-driven provider (e.g. a webhook-based RescueTime alternative) would need the
-- exact same capability -- no reason to add a second column for the same shape.
alter table public.oauth_connections
  add column external_account_id text;

-- One external account should never silently fan into two of our users' connections for
-- the same provider (would make webhook resolution ambiguous).
create unique index oauth_connections_external_account_idx
  on public.oauth_connections (provider, external_account_id)
  where external_account_id is not null;
