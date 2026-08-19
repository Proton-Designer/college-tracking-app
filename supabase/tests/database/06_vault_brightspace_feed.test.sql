-- Proves the Brightspace ICS feed URL is actually encrypted at rest (F3 -- a feed URL
-- is a bearer credential, same category as an OAuth token even though the delivery
-- mechanism differs), not just routed through a column named "vault_secret_id" that
-- happens to still hold plaintext. Same structure as 02_vault_oauth_tokens.test.sql,
-- proving the same five properties for the second Vault-backed secret in this schema.
begin;
select plan(7);

insert into auth.users (id, email) values ('21000000-0000-0000-0000-000000000001', 'vault-brightspace@test.local');

set role authenticated;
set request.jwt.claims = '{"sub":"21000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select private.store_brightspace_feed_url(
    '21000000-0000-0000-0000-000000000001'::uuid, 'https://purdue.brightspace.example/calendar/feed/real-looking-token-abc123.ics'
  )$$,
  'an authenticated user can store their own Brightspace feed URL'
);

select is(
  (select private.get_brightspace_feed_url('21000000-0000-0000-0000-000000000001'::uuid)),
  'https://purdue.brightspace.example/calendar/feed/real-looking-token-abc123.ics',
  'the authorized retrieval path returns the original plaintext URL'
);

reset role;

-- The raw ciphertext in vault.secrets must never equal the plaintext URL -- the actual
-- proof of encryption, not just indirection.
select isnt(
  (select secret from vault.secrets
    where id = (select vault_secret_id from public.brightspace_feeds
                where user_id = '21000000-0000-0000-0000-000000000001')),
  'https://purdue.brightspace.example/calendar/feed/real-looking-token-abc123.ics',
  'the raw vault.secrets.secret column is ciphertext, not the plaintext feed URL'
);

-- brightspace_feeds itself never stores the URL in any column but the vault reference.
select is(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'brightspace_feeds'
      and column_name in ('ics_url', 'url', 'feed_url')),
  0::bigint,
  'brightspace_feeds has no plaintext URL column at all'
);

-- A second user cannot decrypt the first user's feed URL even via the authorized
-- function path, because the function checks auth.uid() against the requested user_id.
insert into auth.users (id, email) values ('21000000-0000-0000-0000-000000000002', 'vault-brightspace-other@test.local');
set role authenticated;
set request.jwt.claims = '{"sub":"21000000-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
  $$select private.get_brightspace_feed_url('21000000-0000-0000-0000-000000000001'::uuid)$$,
  'not authorized',
  'a different user cannot retrieve another user''s Brightspace feed URL, even through the function path'
);

reset role;

-- Proving the PRIVATE function is safe is not the same as proving the WRAPPER is --
-- private.* is unreachable via PostgREST's .rpc() at all (config.toml excludes it from
-- the exposed schemas), so public.store_brightspace_feed_url/get_brightspace_feed_url
-- are the actual reachable surface the brightspace-sync Edge Function calls. Re-runs
-- the refusal proof through that surface specifically.
insert into auth.users (id, email) values ('21000000-0000-0000-0000-000000000003', 'vault-brightspace-wrapper@test.local');
set role authenticated;
set request.jwt.claims = '{"sub":"21000000-0000-0000-0000-000000000003","role":"authenticated"}';

select lives_ok(
  $$select public.store_brightspace_feed_url(
    '21000000-0000-0000-0000-000000000003'::uuid, 'https://purdue.brightspace.example/calendar/feed/wrapper-token.ics'
  )$$,
  'the public wrapper lets an authenticated user store their own Brightspace feed URL'
);

reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"21000000-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
  $$select public.get_brightspace_feed_url('21000000-0000-0000-0000-000000000003'::uuid)$$,
  'not authorized',
  'the public wrapper itself refuses a different user''s request, not just the private function underneath'
);

reset role;
select * from finish();
rollback;
