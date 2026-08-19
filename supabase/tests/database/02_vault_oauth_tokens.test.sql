-- Proves OAuth tokens are actually encrypted at rest (constraint #6), not just routed
-- through a table named "vault_secret_id" that happens to still hold plaintext.
begin;
select plan(7);

insert into auth.users (id, email) values ('20000000-0000-0000-0000-000000000001', 'vault@test.local');

set role authenticated;
set request.jwt.claims = '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select private.store_oauth_token(
    '20000000-0000-0000-0000-000000000001'::uuid, 'whoop', 'sk-real-looking-whoop-token-abc123'
  )$$,
  'an authenticated user can store their own OAuth token'
);

select is(
  (select private.get_oauth_token('20000000-0000-0000-0000-000000000001'::uuid, 'whoop')),
  'sk-real-looking-whoop-token-abc123',
  'the authorized retrieval path returns the original plaintext token'
);

reset role;

-- The raw ciphertext in vault.secrets must never equal the plaintext -- this is the
-- actual proof of encryption, not just indirection. vault.secrets is only readable by
-- postgres/service_role, never by `authenticated` directly, so this runs after reset role.
select isnt(
  (select secret from vault.secrets
    where id = (select vault_secret_id from public.oauth_connections
                where user_id = '20000000-0000-0000-0000-000000000001' and provider = 'whoop')),
  'sk-real-looking-whoop-token-abc123',
  'the raw vault.secrets.secret column is ciphertext, not the plaintext token'
);

-- oauth_connections itself never stores the token in any of its own columns.
select is(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'oauth_connections'
      and column_name in ('token', 'access_token', 'refresh_token', 'secret')),
  0::bigint,
  'oauth_connections has no plaintext token column at all'
);

-- A second user cannot decrypt the first user's token even via the authorized function
-- path, because the function checks auth.uid() against the requested user_id.
insert into auth.users (id, email) values ('20000000-0000-0000-0000-000000000002', 'vault-other@test.local');
set role authenticated;
set request.jwt.claims = '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
  $$select private.get_oauth_token('20000000-0000-0000-0000-000000000001'::uuid, 'whoop')$$,
  'not authorized',
  'a different user cannot retrieve another user''s OAuth token, even through the function path'
);

reset role;

-- Proving the PRIVATE function is safe is not the same as proving the WRAPPER is --
-- private.* is unreachable via PostgREST's .rpc() at all (config.toml excludes it from
-- the exposed schemas), so public.store_oauth_token/get_oauth_token are the actual
-- reachable surface a real caller uses. Re-runs the same refusal proof through that
-- surface specifically, not the implementation underneath it.
set role authenticated;
set request.jwt.claims = '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}';

select lives_ok(
  $$select public.store_oauth_token(
    '20000000-0000-0000-0000-000000000001'::uuid, 'rescuetime', 'sk-real-looking-rescuetime-token-xyz789'
  )$$,
  'the public wrapper lets an authenticated user store their own OAuth token'
);

reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}';

select throws_ok(
  $$select public.get_oauth_token('20000000-0000-0000-0000-000000000001'::uuid, 'rescuetime')$$,
  'not authorized',
  'the public wrapper itself refuses a different user''s request, not just the private function underneath'
);

reset role;
select * from finish();
rollback;
