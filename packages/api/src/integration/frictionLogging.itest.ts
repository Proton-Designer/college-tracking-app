import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { signIn } from '../auth/auth';
import { logFriction, listFrictionLogs } from '../data/frictionLogs';
import { computeUserFrictionDistribution, computeUserFrictionTrend } from '../day/frictionAnalytics';
import { getUserLocalToday } from '../day/today';
import { DEMO_EMAIL, DEMO_PASSWORD, SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

const TIMEZONE = 'America/Indiana/Indianapolis';

// Windows placed far in the future (seed.sql only ever writes friction_logs within the
// last 30 days of "today") so this file's distribution/trend assertions are isolated
// from real seeded data and stay idempotent across repeated runs -- deleted and
// recreated fresh in beforeAll each time, rather than accumulating.
const PREVIOUS_WINDOW = { since: '2099-01-01', until: '2099-01-07' };
const CURRENT_WINDOW = { since: '2099-01-08', until: '2099-01-14' };

describe('friction logging against the seeded demo user', () => {
  let client: TypedSupabaseClient;
  let userId: string;

  beforeAll(async () => {
    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const result = await signIn(client, { email: DEMO_EMAIL, password: DEMO_PASSWORD });
    if (!result.ok) throw new Error(`demo signIn failed: ${result.error.code}`);
    userId = result.data.session.user.id;

    await client.from('friction_logs').delete().eq('user_id', userId).gte('local_date', '2099-01-01');
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
    const { data: course } = await client.from('courses').select('id').limit(1).single();
    const { data: task } = await client
      .from('tasks')
      .insert({
        user_id: userId,
        course_id: course!.id,
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
