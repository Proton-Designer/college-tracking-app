#!/usr/bin/env node
/**
 * Throwaway account engineered to score a real "low" RiskBand -- for verifying the
 * Aurora's calm state live, which no existing account (demo or otherwise) has ever
 * produced. Local Supabase only, same service-role guard as scripts/make-test-user.mjs.
 *
 * Deliberately: due date 90 days out (proximity -> 0), no grade_item_id so weightPct=0,
 * two tasks linked to the deliverable both completed (unfinished=0), course
 * difficulty_rating=1 / confidence_rating=5 (a real "I've got this" self-rating, not
 * missing data), no calendar events (congestion=0), no target_grade_pct (gradeHeadroom
 * excluded rather than fabricated).
 */
import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Same guard as make-test-user.mjs: this uses service-role and would create real users
// in a real project. Local only, enforced in code rather than by convention.
if (!['localhost', '127.0.0.1'].includes(new URL_(URL).hostname)) {
  console.error(`REFUSING: SUPABASE_URL is "${URL}". This script uses service-role and is local-only.`);
  process.exit(1);
}
function URL_(u) { return new globalThis.URL(u); }
if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY. Run:  set -a; . ./.env.local; set +a');
  process.exit(1);
}

const email = `calm-${Date.now()}@collegeos.test`;
const password = 'CollegeOS-Verify-2026';
const admin = createClient(URL, SERVICE_KEY);

const { data: created, error: userErr } = await admin.auth.admin.createUser({
  email, password, email_confirm: true,
});
if (userErr) { console.error('createUser failed:', userErr.message); process.exit(1); }
const userId = created.user.id;

await admin.from('profiles').update({ timezone: 'America/Indiana/Indianapolis' }).eq('id', userId);

const { data: course, error: courseErr } = await admin
  .from('courses')
  .insert({
    user_id: userId, code: 'CALM 100', name: 'Calm Verification Course', term: 'Fall 2026',
    difficulty_rating: 1, confidence_rating: 5,
  })
  .select('id').single();
if (courseErr) { console.error('course insert failed:', courseErr.message); process.exit(1); }

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Indiana/Indianapolis' });
const dueAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();

const { data: deliverable, error: delivErr } = await admin
  .from('deliverables')
  .insert({
    user_id: userId, course_id: course.id, title: 'Far-off paper, already drafted',
    type: 'paper', due_at: dueAt, status: 'in_progress',
  })
  .select('id').single();
if (delivErr) { console.error('deliverable insert failed:', delivErr.message); process.exit(1); }

const { error: taskErr } = await admin.from('tasks').insert([
  { user_id: userId, course_id: course.id, deliverable_id: deliverable.id, title: 'Draft outline', category: 'writing', planned_date: today, status: 'completed' },
  { user_id: userId, course_id: course.id, deliverable_id: deliverable.id, title: 'Draft body', category: 'writing', planned_date: today, status: 'completed' },
]);
if (taskErr) { console.error('task insert failed:', taskErr.message); process.exit(1); }

console.log(`\n  email       ${email}\n  password    ${password}\n  user_id     ${userId}\n  course      CALM 100 (id ${course.id})\n  deliverable "Far-off paper, already drafted" due ${dueAt} (id ${deliverable.id})\n`);
console.log('  Delete when done:  node scripts/delete-test-user.mjs ' + email + '\n');
