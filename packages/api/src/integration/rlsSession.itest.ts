import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { getSession, signIn } from '../auth/auth';
import { getOwnProfile } from '../data/profiles';
import { createCourse, listCourses } from '../data/courses';
import type { Database } from '../database.types';

// Proves the real thing the L3 assignment asked for: real signup (via the admin API,
// pre-confirmed -- matching Nova's own E2E fixture convention) -> real session issued by
// the actual local GoTrue server -> an RLS-scoped read that returns only that user's rows,
// verified against a second real user rather than assumed from the schema.

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ready = Boolean(SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY);

async function createConfirmedUser(email: string, password: string) {
  const admin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error ?? new Error('admin.createUser returned no user');
  return data.user;
}

describe.skipIf(!ready)('real signup -> real session -> RLS-scoped read', () => {
  const passwordA = 'itest-password-aaa-111';
  const passwordB = 'itest-password-bbb-222';
  const emailA = `itest-rls-a-${Date.now()}@collegeos.test`;
  const emailB = `itest-rls-b-${Date.now()}@collegeos.test`;

  it('a real signed-in session sees its own profile and its own courses, never another user\'s', async () => {
    const userA = await createConfirmedUser(emailA, passwordA);
    const userB = await createConfirmedUser(emailB, passwordB);

    const clientA = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const clientB = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);

    const signInA = await signIn(clientA, { email: emailA, password: passwordA });
    expect(signInA.ok).toBe(true);
    const signInB = await signIn(clientB, { email: emailB, password: passwordB });
    expect(signInB.ok).toBe(true);

    // getSession round-trips through the real auth server too, not just signIn's response.
    const sessionA = await getSession(clientA);
    expect(sessionA.ok).toBe(true);
    if (sessionA.ok) expect(sessionA.data?.user.id).toBe(userA.id);

    const profileA = await getOwnProfile(clientA);
    expect(profileA.ok).toBe(true);
    if (profileA.ok) expect(profileA.data.id).toBe(userA.id);

    const createdA = await createCourse(clientA, { user_id: userA.id, code: 'ITEST 101', name: 'RLS check A', term: 'Test' });
    expect(createdA.ok).toBe(true);
    const createdB = await createCourse(clientB, { user_id: userB.id, code: 'ITEST 102', name: 'RLS check B', term: 'Test' });
    expect(createdB.ok).toBe(true);

    const coursesForA = await listCourses(clientA);
    expect(coursesForA.ok).toBe(true);
    if (coursesForA.ok) {
      expect(coursesForA.data.some((c) => c.code === 'ITEST 101')).toBe(true);
      expect(coursesForA.data.some((c) => c.code === 'ITEST 102')).toBe(false);
    }

    const coursesForB = await listCourses(clientB);
    expect(coursesForB.ok).toBe(true);
    if (coursesForB.ok) {
      expect(coursesForB.data.some((c) => c.code === 'ITEST 102')).toBe(true);
      expect(coursesForB.data.some((c) => c.code === 'ITEST 101')).toBe(false);
    }
  });

  it('a user cannot insert a row claiming to be another user\'s (RLS WITH CHECK holds)', async () => {
    const userA = await createConfirmedUser(`itest-rls-check-${Date.now()}@collegeos.test`, passwordA);
    const clientA = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const signInA = await signIn(clientA, { email: userA.email!, password: passwordA });
    expect(signInA.ok).toBe(true);

    const spoofed = await createCourse(clientA, {
      user_id: '00000000-0000-0000-0000-000000000099', // not userA.id
      code: 'SPOOF 101',
      name: 'Should be rejected',
      term: 'Test',
    });
    expect(spoofed.ok).toBe(false);
  });
});
