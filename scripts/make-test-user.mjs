#!/usr/bin/env node
/**
 * Create a ready-to-use throwaway account for manual/simulator verification.
 *
 * Why this exists: dynamically-created verification accounts do NOT survive
 * `supabase db reset` — a reset reseeds from seed.sql only. That has now interrupted
 * on-device verification three times, each costing more than this script did.
 * Recreate in seconds instead of rebuilding fixtures by hand.
 *
 *   node scripts/make-test-user.mjs            # random email
 *   node scripts/make-test-user.mjs foo@bar.io # explicit email
 *
 * Creates: confirmed user + profile timezone + one course + one task planned for today.
 * Reads against demo@collegeos.app; writes go here. Never point this at cloud.
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Same guard as the integration suite: this uses service-role and would create real
// users in a real project. Local only, enforced in code rather than by convention.
const host = new URL_(URL).hostname;
function URL_(u) { return new globalThis.URL(u); }
if (!['localhost', '127.0.0.1'].includes(host)) {
  console.error(`REFUSING: SUPABASE_URL is "${URL}". This script uses service-role and is local-only.`);
  process.exit(1);
}
if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY. Run:  set -a; . ./.env.local; set +a');
  process.exit(1);
}

const email = process.argv[2] ?? `verify-${Date.now()}@collegeos.test`;
const password = 'CollegeOS-Verify-2026';
const admin = createClient(URL, SERVICE_KEY);

const { data: created, error: userErr } = await admin.auth.admin.createUser({
  email, password, email_confirm: true,
});
if (userErr) { console.error('createUser failed:', userErr.message); process.exit(1); }
const userId = created.user.id;

// The profile row is created by a trigger on auth.users; set a real timezone so
// local_date derivation behaves like a real account rather than defaulting.
await admin.from('profiles').update({ timezone: 'America/Indiana/Indianapolis' }).eq('id', userId);

const { data: course, error: courseErr } = await admin
  .from('courses')
  .insert({ user_id: userId, code: 'TEST 101', name: 'Verification Course', term: 'Fall 2026', target_grade_pct: 90 })
  .select('id').single();
if (courseErr) { console.error('course insert failed:', courseErr.message); process.exit(1); }

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Indiana/Indianapolis' });
const { error: taskErr } = await admin.from('tasks').insert({
  user_id: userId, course_id: course.id, title: 'Verification task', category: 'homework',
  planned_date: today, status: 'pending', mit_rank: 1, estimated_minutes: 45,
});
if (taskErr) { console.error('task insert failed:', taskErr.message); process.exit(1); }

console.log(`\n  email     ${email}\n  password  ${password}\n  user_id   ${userId}\n  course    TEST 101 (id ${course.id})\n  task      "Verification task" planned for ${today}\n`);
console.log('  Delete when done:  node scripts/delete-test-user.mjs ' + email + '\n');
