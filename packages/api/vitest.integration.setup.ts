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
