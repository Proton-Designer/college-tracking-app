import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Load the monorepo root .env.local so integration tests just work with a bare
// `npm run test:integration`, without needing `source .env.local` first. A suite that
// silently skips when env is missing is worse than one that fails loudly -- see the L4
// report's fix for details.
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const envPath = resolve(repoRoot, '.env.local');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(
    `Integration tests require a running local Supabase stack, but env is missing: ${missing.join(', ')}. ` +
      'Run `npm run db:start` (or `supabase start`) and ensure .env.local is populated at the repo root, then retry. ' +
      'This suite fails loudly rather than skipping -- a silently-skipped integration run is worse than none.',
  );
}

// Guard for the repair step below: it calls the admin API with the service-role key,
// which bypasses RLS entirely, to overwrite a real user's password. Locally that's
// exactly the seeded demo account. But if SUPABASE_URL ever pointed at a cloud project
// -- a CI misconfiguration, a stray `supabase link`, someone debugging against staging
// with the wrong env loaded -- this would silently reset a real password in a real
// database. Refuse outright unless the target is unambiguously local.
const supabaseUrl = new URL(process.env.SUPABASE_URL!);
const isLocalTarget = supabaseUrl.hostname === 'localhost' || supabaseUrl.hostname === '127.0.0.1';
if (!isLocalTarget) {
  throw new Error(
    `Integration tests mutate user credentials (see the demo-account repair step) and must only run ` +
      `against a local stack. Refusing to run against SUPABASE_URL=${process.env.SUPABASE_URL} -- ` +
      'point .env.local at http://127.0.0.1:54321 (or your local port) before retrying.',
  );
}

// S1: every itest file signs in as the seeded demo@collegeos.app account. That
// credential is mutable shared state -- something (never definitively root-caused; see
// the seed-coverage report) once changed its password mid-session, and every test in
// every file failed with an opaque "signIn failed", not "the fixture moved". Rather than
// depend on the credential staying whatever seed.sql last set it to, assert-and-repair
// it here, every time any integration file starts: force it back to the canonical value
// via the admin API (service-role, bypasses the normal auth flow entirely) before any
// test gets a chance to sign in. Idempotent -- resetting an already-correct password is
// a no-op in effect, so this is safe to run once per test file, not just once per run.
const { createClient } = await import('@supabase/supabase-js');
const { DEMO_USER_ID, DEMO_PASSWORD } = await import('./src/integration/testSupport');
const adminClient = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { error: repairError } = await adminClient.auth.admin.updateUserById(DEMO_USER_ID, {
  password: DEMO_PASSWORD,
  email_confirm: true,
});
if (repairError) {
  throw new Error(`Failed to assert-and-repair the demo user credential before running integration tests: ${repairError.message}`);
}
