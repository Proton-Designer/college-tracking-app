-- Extensions used across CollegeOS.
--
-- pgcrypto    : digest()/hashing (llm_usage_log content hashes), gen_random_uuid() where needed.
-- pg_net      : async HTTP from Postgres (WHOOP webhooks, deadline-change notifications).
-- supabase_vault: encrypted secret storage for OAuth tokens (never plaintext — see oauth_connections).
-- pgtap       : test-only. Harmless in production (adds testing functions, no schema impact
--               on app tables). On hosted Supabase this may instead need enabling via
--               Dashboard -> Database -> Extensions if this migration lacks permission there;
--               see docs/SUPABASE_SETUP.md.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;
create extension if not exists pgtap with schema extensions;
