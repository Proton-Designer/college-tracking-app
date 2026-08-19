import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '@collegeos/core';
import { getUserLocalToday } from '../day/today';
import { getDayView } from '../day/dayView';
import { generateAndPersistWeeklyPlan } from '../planning/weeklyPlan';
import { createConfirmedUser, SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

const TIMEZONE = 'America/Indiana/Indianapolis';

// Regression coverage for a real, already-shipped bug: computeHistoricalCapacityP50Min's
// median over zero daily_reviews history was exactly 0, which made
// computeCapacityMinutes (and therefore both Today's workload AND weekly planning)
// compute EXACTLY ZERO usable capacity for every brand-new user, silently, on day one --
// found live via a weekly-planning itest against a genuinely fresh throwaway user, the
// first thing in this codebase to actually exercise the cold path (every other itest and
// the demo account run against seeded history). This test intentionally seeds NOTHING,
// so a future regression here is never invisible again.
describe('cold-start capacity (a user with zero daily_reviews history)', () => {
  let client: TypedSupabaseClient;
  let userId: string;
  let today: string;

  beforeAll(async () => {
    const email = `itest-coldstart-${Date.now()}@collegeos.test`;
    const password = 'itest-coldstart-password-1';
    const user = await createConfirmedUser(email, password);
    userId = user.id;

    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    today = getUserLocalToday(TIMEZONE);
    // Deliberately no daily_reviews seeded -- this IS the cold-start condition.
  });

  it("getDayView gives a brand-new user real, usable capacity -- not zero -- and marks it as an estimate", async () => {
    const result = await getDayView(client, userId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.workload.capacityMinutes).toBeGreaterThan(0);
    expect(result.data.capacityConfidence).toBe('insufficient');
  });

  it('generateAndPersistWeeklyPlan gives a brand-new user a usable plan -- real capacity, an actual placed block, and a marked-provisional confidence', async () => {
    const { data: course, error: courseError } = await client.from('courses').insert({ user_id: userId, code: 'COLD100', name: 'Cold Start Fixture', term: 'Fall 2026' }).select('id').single();
    expect(courseError).toBeNull();

    const dueDate = addDays(today, 3);
    const { data: deliverable, error: deliverableError } = await client
      .from('deliverables')
      .insert({ user_id: userId, course_id: course!.id, title: 'First assignment', type: 'problem_set', due_at: `${dueDate}T23:59:00Z`, local_due_date: dueDate, estimated_minutes: 60 })
      .select('id')
      .single();
    expect(deliverableError).toBeNull();

    const { error: taskError } = await client
      .from('tasks')
      .insert({ user_id: userId, course_id: course!.id, deliverable_id: deliverable!.id, title: 'Start the assignment', category: 'problem_set', estimated_minutes: 60, planned_date: today, status: 'pending' });
    expect(taskError).toBeNull();

    const result = await generateAndPersistWeeklyPlan(client, userId, today, today, { force: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.plan.totalCapacityMinutes).toBeGreaterThan(0);
    expect(result.data.plan.blocks.length).toBeGreaterThan(0);
    expect(result.data.plan.blocks.some((b) => b.deliverableId === deliverable!.id)).toBe(true);
    expect(result.data.capacityConfidence).toBe('insufficient'); // real, but explicitly marked as an estimate
  });
});
