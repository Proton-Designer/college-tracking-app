import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { logFriction, listFrictionLogs } from '../data/frictionLogs';
import { computeUserFrictionDistribution, computeUserFrictionTrend } from '../day/frictionAnalytics';
import { getUserLocalToday } from '../day/today';
import { createConfirmedUser, SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

const TIMEZONE = 'America/Indiana/Indianapolis';

// Windows placed far in the future (well past any realistic seed data) so this file's
// distribution/trend assertions never depend on what else has been logged for the day
// -- redundant with the throwaway-user isolation below, but cheap insurance since a
// window this file's own "today" test writes into could otherwise overlap it.
const PREVIOUS_WINDOW = { since: '2099-01-01', until: '2099-01-07' };
const CURRENT_WINDOW = { since: '2099-01-08', until: '2099-01-14' };

// Dedicated throwaway user, not demo -- "reads against demo, writes against a
// throwaway" (same line focusSessions.itest.ts already draws). Demo's value is its
// stable, curated semester data; every friction_logs row this file writes there would
// degrade that for anyone using it for screenshots or manual review.
describe('friction logging against a dedicated throwaway user', () => {
  let client: TypedSupabaseClient;
  let userId: string;

  beforeAll(async () => {
    const email = `itest-friction-${Date.now()}@collegeos.test`;
    const password = 'itest-friction-password-1';
    const user = await createConfirmedUser(email, password);
    userId = user.id;

    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
  });

  it('logs a friction event with just a cause, and the trigger computes a real local_date', async () => {
    const now = new Date();
    const logged = await logFriction(client, userId, { cause: 'distracted' });
    expect(logged.ok).toBe(true);
    if (!logged.ok) return;
    expect(logged.data.cause).toBe('distracted');
    expect(logged.data.related_task_id).toBeNull();
    expect(logged.data.local_date).toBe(getUserLocalToday(TIMEZONE, now));

    const logs = await listFrictionLogs(client, userId);
    expect(logs.ok).toBe(true);
    if (logs.ok) expect(logs.data.some((l) => l.id === logged.data.id)).toBe(true);

    // Clean up -- this one lands on today's real local_date, not the isolated future window.
    await client.from('friction_logs').delete().eq('id', logged.data.id);
  });

  it('links a friction log to the real task it explains', async () => {
    // No course dependency -- tasks.course_id is nullable, and a throwaway user has no
    // seeded courses to link to anyway.
    const { data: task } = await client
      .from('tasks')
      .insert({
        user_id: userId,
        title: `friction-test-${Date.now()}`,
        category: 'testing',
        estimated_minutes: 30,
        planned_date: new Date().toISOString().slice(0, 10),
        status: 'cancelled',
      })
      .select('id')
      .single();

    const logged = await logFriction(client, userId, {
      cause: 'underestimated_duration',
      relatedTaskId: task!.id,
      causeDetail: 'Ran twice as long as expected',
    });
    expect(logged.ok).toBe(true);
    if (logged.ok) expect(logged.data.related_task_id).toBe(task!.id);

    if (logged.ok) await client.from('friction_logs').delete().eq('id', logged.data.id);
    await client.from('tasks').delete().eq('id', task!.id);
  });

  it('computes a real cause distribution -- pure counts, not judgment', async () => {
    const dayInWindow = new Date(`${PREVIOUS_WINDOW.since}T12:00:00Z`);
    await Promise.all([
      logFriction(client, userId, { cause: 'distracted', occurredAt: dayInWindow }),
      logFriction(client, userId, { cause: 'distracted', occurredAt: dayInWindow }),
      logFriction(client, userId, { cause: 'tired', occurredAt: dayInWindow }),
    ]);

    const result = await computeUserFrictionDistribution(client, userId, PREVIOUS_WINDOW.since, PREVIOUS_WINDOW.until);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.totalCount).toBe(3);
    const distracted = result.data.entries.find((e) => e.cause === 'distracted');
    expect(distracted?.count).toBe(2);
    expect(distracted?.percentage).toBeCloseTo((2 / 3) * 100, 5);
  });

  it('reports a real per-cause trend across two consecutive windows', async () => {
    // Previous window already has 2x distracted, 1x tired (from the prior test).
    // Current window: distracted rises further (3x), tired disappears entirely.
    const dayInCurrentWindow = new Date(`${CURRENT_WINDOW.since}T12:00:00Z`);
    await Promise.all([
      logFriction(client, userId, { cause: 'distracted', occurredAt: dayInCurrentWindow }),
      logFriction(client, userId, { cause: 'distracted', occurredAt: dayInCurrentWindow }),
      logFriction(client, userId, { cause: 'distracted', occurredAt: dayInCurrentWindow }),
    ]);

    const trend = await computeUserFrictionTrend(client, userId, PREVIOUS_WINDOW, CURRENT_WINDOW);
    expect(trend.ok).toBe(true);
    if (!trend.ok) return;

    const distracted = trend.data.find((e) => e.cause === 'distracted');
    expect(distracted).toBeDefined();
    expect(distracted!.previousPercentage).toBeCloseTo((2 / 3) * 100, 5);
    expect(distracted!.currentPercentage).toBe(100); // only cause logged in the current window
    expect(distracted!.direction).toBe('up');

    const tired = trend.data.find((e) => e.cause === 'tired');
    expect(tired).toBeDefined();
    expect(tired!.currentPercentage).toBe(0); // present previously, absent now -- not omitted
    expect(tired!.direction).toBe('down');
  });
});
