import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { computeRiskAssessment } from '../day/risk';
import { createConfirmedUser, SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

// Reproduces the /courses/[id] 500 the Lead found live on the demo account: course
// detail (and, after the archive migration, the Courses list/Calendar/Today once any
// course is archived) passes computeRiskAssessment a courseFacts array scoped to a
// SUBSET of the user's courses, but the deliverables query inside it was unscoped by
// course -- so a deliverable belonging to any course outside that subset hit the
// FK-guaranteed throw at risk.ts's "references missing course" line even though nothing
// about that deliverable is actually broken.
//
// Every test here asserts the CORRECT (post-fix) behavior -- this file was run once
// before the fix landed to confirm every "must not throw" assertion below genuinely
// failed with "references missing course N" first (see the commit this ships with for
// the captured red output). The throw itself (risk.ts:130, corrupt-data guard) stays
// intact and is never the thing under test here -- these tests exist to prove the
// deliverables query no longer feeds it a deliverable the caller never asked about.
//
// Throwaway user, not demo -- writes real courses/deliverables rows.
describe('computeRiskAssessment: deliverables must be scoped to the courses actually passed in', () => {
  let client: TypedSupabaseClient;
  let userId: string;
  let courseAId: number;
  let courseBId: number;
  const today = '2026-11-01';

  const courseFacts = (id: number, code: string) => ({
    id,
    code,
    name: code,
    difficulty_rating: null,
    confidence_rating: null,
    target_grade_pct: null,
  });

  beforeAll(async () => {
    const email = `itest-risk-${Date.now()}@collegeos.test`;
    const password = 'itest-risk-password-1';
    const user = await createConfirmedUser(email, password);
    userId = user.id;

    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;

    const { data: courses, error } = await client
      .from('courses')
      .insert([
        { user_id: userId, code: 'BME 301', name: 'Biomedical Instrumentation', term: 'Fall 2026' },
        { user_id: userId, code: 'CS 180', name: 'Problem Solving', term: 'Fall 2026' },
      ])
      .select('id, code');
    if (error) throw error;
    courseAId = courses!.find((c) => c.code === 'BME 301')!.id;
    courseBId = courses!.find((c) => c.code === 'CS 180')!.id;

    await client.from('deliverables').insert([
      {
        user_id: userId,
        course_id: courseAId,
        title: 'A1 problem set',
        type: 'problem_set',
        due_at: '2026-11-10T18:00:00Z',
        local_due_date: '1970-01-01',
      },
      {
        user_id: userId,
        course_id: courseBId,
        title: 'B1 project',
        type: 'project',
        due_at: '2026-11-12T18:00:00Z',
        local_due_date: '1970-01-01',
      },
    ]);
  });

  it('course-detail shape: courseFacts scoped to one course must not throw just because another course has a deliverable', async () => {
    const result = await computeRiskAssessment(client, userId, today, [courseFacts(courseAId, 'BME 301')], [], null);
    expect(result.deliverableRisks.length).toBeGreaterThanOrEqual(1);
    expect(result.deliverableRisks.every((r) => r.courseId === courseAId)).toBe(true);
    expect(result.deliverableRisks.some((r) => r.title === 'A1 problem set')).toBe(true);
    // The other course's deliverable is scoped out entirely, not encountered -- not
    // silently swallowed by a softened catch.
    expect(result.deliverableRisks.some((r) => r.title === 'B1 project')).toBe(false);
  });

  it('archive shape: an archived course\'s deliverable must not crash risk assessment for the courses that remain', async () => {
    // Simulates listCourses' migration-0030 archived_at exclusion: the caller only has
    // course A in hand because B is archived, but B's deliverable row still exists.
    const result = await computeRiskAssessment(client, userId, today, [courseFacts(courseAId, 'BME 301')], [], null);
    expect(result.deliverableRisks.every((r) => r.courseId === courseAId)).toBe(true);
  });

  it('passing both courses still returns both -- the fix is behavior-preserving for all-courses callers', async () => {
    const result = await computeRiskAssessment(
      client,
      userId,
      today,
      [courseFacts(courseAId, 'BME 301'), courseFacts(courseBId, 'CS 180')],
      [],
      null,
    );
    const titles = result.deliverableRisks.map((r) => r.title).sort();
    expect(titles).toEqual(['A1 problem set', 'B1 project']);
  });

  it('E0: a brand-new user with zero courses resolves cleanly to an empty result -- the .in() filter must not choke on an empty id list', async () => {
    const result = await computeRiskAssessment(client, userId, today, [], [], null);
    expect(result.deliverableRisks).toEqual([]);
    expect(result.courseRisks).toEqual([]);
  });

  it('a course with zero deliverables resolves cleanly to an empty result, not a throw', async () => {
    const { data: emptyCourse, error } = await client
      .from('courses')
      .insert({ user_id: userId, code: 'PHYS 241', name: 'Physics', term: 'Fall 2026' })
      .select('id')
      .single();
    expect(error).toBeNull();

    const result = await computeRiskAssessment(client, userId, today, [courseFacts(emptyCourse!.id, 'PHYS 241')], [], null);
    expect(result.deliverableRisks).toEqual([]);
    expect(result.courseRisks).toEqual([]);
  });

  // The FK-guaranteed throw at risk.ts:130 stays intact as a defensive invariant check --
  // the Lead's explicit instruction not to soften it. After this fix, every deliverable
  // the query returns already has its course_id inside `courses.map(c => c.id)` (that's
  // what the .in() filter guarantees), so courseById.get() always finds a match by
  // construction and this guard becomes unreachable through computeRiskAssessment's own
  // inputs. It remains as a real check against a future regression that reintroduces an
  // unscoped fetch, not as dead code -- there is no way to exercise it honestly from the
  // outside without breaking the FK constraint the database itself enforces.
});
