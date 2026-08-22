import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDeliverable, deleteDeliverable, updateDeliverable } from '../data/deliverables';
import { createConfirmedUser, SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

// L12A/E1: manual assignment CRUD, the highest-leverage gap in the data-entry audit.
// Runs against a dedicated throwaway user (writes real courses/deliverables rows), not
// demo -- same line every write-heavy itest in this file draws.
describe('deliverable CRUD against a dedicated throwaway user', () => {
  let client: TypedSupabaseClient;
  let userId: string;
  let courseId: number;

  beforeAll(async () => {
    const email = `itest-deliverables-${Date.now()}@collegeos.test`;
    const password = 'itest-deliverables-password-1';
    const user = await createConfirmedUser(email, password);
    userId = user.id;

    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;

    const { data: course, error } = await client
      .from('courses')
      .insert({ user_id: userId, code: 'BME 301', name: 'Biomedical Instrumentation', term: 'Fall 2026' })
      .select('id')
      .single();
    if (error) throw error;
    courseId = course.id;
  });

  it('creates a deliverable and the DB trigger derives a real local_due_date, not the placeholder sentinel', async () => {
    const created = await createDeliverable(client, userId, {
      courseId,
      title: 'HW3',
      type: 'problem_set',
      dueAt: '2026-11-15T18:00:00Z',
      estimatedMinutes: 90,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.data.title).toBe('HW3');
    expect(created.data.status).toBe('not_started');
    expect(created.data.local_due_date).not.toBe('1970-01-01');
    // Real value derived from due_at + the profile's timezone -- any real-world offset
    // keeps it on the same UTC calendar day or the one before, never further off.
    expect(['2026-11-14', '2026-11-15']).toContain(created.data.local_due_date);

    // Verify the write directly, not just the function's return value.
    const { data: row } = await client.from('deliverables').select('*').eq('id', created.data.id).single();
    expect(row!.local_due_date).toBe(created.data.local_due_date);
    expect(row!.user_id).toBe(userId);
  });

  it('updates a deliverable, including recomputing local_due_date when due_at changes', async () => {
    const created = await createDeliverable(client, userId, {
      courseId,
      title: 'Exam 1',
      type: 'exam',
      dueAt: '2026-11-01T18:00:00Z',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const originalLocalDate = created.data.local_due_date;

    const updated = await updateDeliverable(client, userId, created.data.id, {
      title: 'Exam 1 (rescheduled)',
      dueAt: '2026-12-01T18:00:00Z',
      status: 'in_progress',
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.data.title).toBe('Exam 1 (rescheduled)');
    expect(updated.data.status).toBe('in_progress');
    expect(updated.data.local_due_date).not.toBe(originalLocalDate);
    expect(['2026-11-30', '2026-12-01']).toContain(updated.data.local_due_date);
  });

  it('deletes a deliverable; a second delete of the same id is refused, not a silent no-op', async () => {
    const created = await createDeliverable(client, userId, {
      courseId,
      title: 'Reading response 4',
      type: 'reading',
      dueAt: '2026-11-20T18:00:00Z',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const deleted = await deleteDeliverable(client, userId, created.data.id);
    expect(deleted.ok).toBe(true);

    const { data: row } = await client.from('deliverables').select('id').eq('id', created.data.id).maybeSingle();
    expect(row).toBeNull();

    const secondDelete = await deleteDeliverable(client, userId, created.data.id);
    expect(secondDelete.ok).toBe(false);
    if (!secondDelete.ok) expect(secondDelete.error.code).toBe('not_found');
  });

  it('a user cannot update or delete another user\'s deliverable', async () => {
    const otherEmail = `itest-deliverables-other-${Date.now()}@collegeos.test`;
    const otherUser = await createConfirmedUser(otherEmail, 'itest-deliverables-password-2');
    const otherClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const { error: otherSignInError } = await otherClient.auth.signInWithPassword({ email: otherEmail, password: 'itest-deliverables-password-2' });
    if (otherSignInError) throw otherSignInError;

    const { data: otherCourse, error: otherCourseError } = await otherClient
      .from('courses')
      .insert({ user_id: otherUser.id, code: 'CS 180', name: 'Problem Solving', term: 'Fall 2026' })
      .select('id')
      .single();
    expect(otherCourseError).toBeNull();

    const created = await createDeliverable(otherClient, otherUser.id, {
      courseId: otherCourse!.id,
      title: 'Other user assignment',
      type: 'project',
      dueAt: '2026-11-20T18:00:00Z',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    // userId (the first throwaway user) attempts to reach the second user's deliverable.
    const updateAttempt = await updateDeliverable(client, userId, created.data.id, { title: 'hijacked' });
    expect(updateAttempt.ok).toBe(false);

    const deleteAttempt = await deleteDeliverable(client, userId, created.data.id);
    expect(deleteAttempt.ok).toBe(false);
    if (!deleteAttempt.ok) expect(deleteAttempt.error.code).toBe('not_found');

    // The row is untouched, verified via its own owner's client, scoped to that owner's id.
    const { data: stillThere } = await otherClient.from('deliverables').select('title').eq('id', created.data.id).eq('user_id', otherUser.id).single();
    expect(stillThere!.title).toBe('Other user assignment');
  });
});
