import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { updateCourse } from '../data/courses';
import {
  createGradeCategory,
  deleteGradeCategory,
  deleteGradeBoundary,
  updateGradeCategory,
  upsertGradeBoundary,
} from '../data/gradeStructure';
import { createConfirmedUser, SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

// L12A: course editing + grade_categories/grade_boundaries CRUD, previously 100%
// read-only. Throwaway user, not demo -- writes real courses/grade_categories rows.
describe('course + grade structure CRUD against a dedicated throwaway user', () => {
  let client: TypedSupabaseClient;
  let userId: string;
  let courseId: number;

  beforeAll(async () => {
    const email = `itest-coursegrade-${Date.now()}@collegeos.test`;
    const password = 'itest-coursegrade-password-1';
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

  it('updates course fields and can archive/un-archive it', async () => {
    const updated = await updateCourse(client, userId, courseId, {
      name: 'Biomedical Instrumentation Lab',
      targetGradePct: 92,
      difficultyRating: 4,
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.data.name).toBe('Biomedical Instrumentation Lab');
    expect(Number(updated.data.target_grade_pct)).toBe(92);
    expect(updated.data.difficulty_rating).toBe(4);
    expect(updated.data.archived_at).toBeNull();

    const archived = await updateCourse(client, userId, courseId, { archivedAt: new Date().toISOString() });
    expect(archived.ok).toBe(true);
    if (archived.ok) expect(archived.data.archived_at).not.toBeNull();

    const unarchived = await updateCourse(client, userId, courseId, { archivedAt: null });
    expect(unarchived.ok).toBe(true);
    if (unarchived.ok) expect(unarchived.data.archived_at).toBeNull();
  });

  it('a user cannot update another user\'s course', async () => {
    const otherEmail = `itest-coursegrade-other-${Date.now()}@collegeos.test`;
    const otherUser = await createConfirmedUser(otherEmail, 'itest-coursegrade-other-password-1');

    const attempt = await updateCourse(client, otherUser.id, courseId, { name: 'hijacked' });
    expect(attempt.ok).toBe(false);

    const { data: row } = await client.from('courses').select('name').eq('id', courseId).single();
    expect(row!.name).not.toBe('hijacked');
  });

  it('creates grade categories, refuses a weight that would push the course over 100%, and allows one that would not', async () => {
    const first = await createGradeCategory(client, userId, { courseId, name: 'Homework', weightPct: 60 });
    expect(first.ok).toBe(true);

    const overBudget = await createGradeCategory(client, userId, { courseId, name: 'Exams', weightPct: 45 });
    expect(overBudget.ok).toBe(false);
    if (!overBudget.ok) {
      expect(overBudget.error.code).toBe('validation');
      expect(overBudget.error.message).toMatch(/105/);
    }

    const withinBudget = await createGradeCategory(client, userId, { courseId, name: 'Exams', weightPct: 40 });
    expect(withinBudget.ok).toBe(true);
    if (!withinBudget.ok) return;
    expect(Number(withinBudget.data.weight_pct)).toBe(40);

    // Updating the same category's own weight upward must exclude its OWN prior value
    // from the running total, not double-count it.
    const updated = await updateGradeCategory(client, userId, withinBudget.data.id, { weightPct: 40 });
    expect(updated.ok).toBe(true);

    const stillOver = await updateGradeCategory(client, userId, withinBudget.data.id, { weightPct: 41 });
    expect(stillOver.ok).toBe(false);

    const deleted = await deleteGradeCategory(client, userId, withinBudget.data.id);
    expect(deleted.ok).toBe(true);

    const { data: remaining } = await client.from('grade_categories').select('id').eq('course_id', courseId);
    expect(remaining!.length).toBe(1);
  });

  it('upserts grade boundaries by (course_id, letter) and deletes one', async () => {
    const created = await upsertGradeBoundary(client, userId, { courseId, letter: 'A', minPct: 93 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const revised = await upsertGradeBoundary(client, userId, { courseId, letter: 'A', minPct: 94 });
    expect(revised.ok).toBe(true);
    if (!revised.ok) return;
    expect(revised.data.id).toBe(created.data.id);
    expect(Number(revised.data.min_pct)).toBe(94);

    const { data: boundaries } = await client.from('grade_boundaries').select('id').eq('course_id', courseId).eq('letter', 'A');
    expect(boundaries!.length).toBe(1);

    const deleted = await deleteGradeBoundary(client, userId, revised.data.id);
    expect(deleted.ok).toBe(true);
    const secondDelete = await deleteGradeBoundary(client, userId, revised.data.id);
    expect(secondDelete.ok).toBe(false);
    if (!secondDelete.ok) expect(secondDelete.error.code).toBe('not_found');
  });
});
