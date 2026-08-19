#!/usr/bin/env node
/**
 * Delete a throwaway verification account created by make-test-user.mjs.
 *
 *   node scripts/delete-test-user.mjs verify-123@collegeos.test
 *   node scripts/delete-test-user.mjs --all-verify     # every *@collegeos.test
 *
 * Uses admin.deleteUser, which cascades every user-scoped row via the FK chain
 * (verified: all 46 tables -> profiles -> auth.users, uniformly ON DELETE CASCADE).
 * Vault secrets and Storage objects do NOT cascade — for a full production-shaped
 * delete use the account-delete edge function. This is local verification cleanup.
 */
import { createClient } from '@supabase/supabase-js';

const URL_STR = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!['localhost', '127.0.0.1'].includes(new URL(URL_STR).hostname)) {
  console.error(`REFUSING: SUPABASE_URL is "${URL_STR}". Service-role delete is local-only.`);
  process.exit(1);
}
if (!SERVICE_KEY) { console.error('Missing SUPABASE_SERVICE_ROLE_KEY.'); process.exit(1); }

const arg = process.argv[2];
if (!arg) { console.error('Usage: delete-test-user.mjs <email> | --all-verify'); process.exit(1); }

const admin = createClient(URL_STR, SERVICE_KEY);
const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
if (error) { console.error(error.message); process.exit(1); }

const targets = arg === '--all-verify'
  ? data.users.filter((u) => u.email?.endsWith('@collegeos.test'))
  : data.users.filter((u) => u.email === arg);

// Never let a wildcard reach the seeded demo account — its value is its stable data.
const safe = targets.filter((u) => u.email !== 'demo@collegeos.app');
if (!safe.length) { console.log('No matching throwaway users.'); process.exit(0); }

for (const u of safe) {
  const { error: delErr } = await admin.auth.admin.deleteUser(u.id);
  console.log(delErr ? `  FAILED ${u.email}: ${delErr.message}` : `  deleted ${u.email}`);
}
