import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { computeYesterdayPlanningExecution } from '../day/planningExecution';
import { createConfirmedUser, SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

// Regression test for the UTC-midnight straddle bug (found during the L12 restart, before
// U2 was rebuilt -- turned out U2 already existed, but the engine that reads
// tasks.planned_start_at back out had a real defect). minutesSinceMidnightUTC() used to
// compute planned/actual "minutes since midnight" independently and subtract them, which
// wraps whenever the two instants fall on different UTC calendar days -- routine for any
// evening-timeboxed task in a US timezone, since UTC midnight is ~7-8pm Eastern. A task
// planned 7:50pm EDT and actually started 30 real minutes late at 8:20pm EDT used to report
// startDelayMin = -1410 ("23.5 hours early") instead of +30.
//
// Runs against a throwaway user (writes task/task_sessions/daily_reviews rows), not demo --
// same line focusSessions.itest.ts already draws.
describe('computeYesterdayPlanningExecution against a dedicated throwaway user', () => {
  let client: TypedSupabaseClient;
  let userId: string;

  const YESTERDAY = '2026-06-15';
  const TODAY = '2026-06-16';

  beforeAll(async () => {
    const email = `itest-planexec-${Date.now()}@collegeos.test`;
    const password = 'itest-planexec-password-1';
    const user = await createConfirmedUser(email, password);
    userId = user.id;

    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
  });

  it('reports the real elapsed minutes, not a wrapped value, when planned and actual straddle UTC midnight', async () => {
    // 7:50pm EDT -- 23:50 UTC on YESTERDAY.
    const plannedStartAt = `${YESTERDAY}T23:50:00Z`;
    // 8:20pm EDT, 30 real minutes later -- 00:20 UTC on TODAY. Crosses the UTC day boundary
    // while staying on the same US local day, which is exactly the case the old
    // per-timestamp minutesSinceMidnightUTC subtraction got wrong.
    const actualStartAt = `${TODAY}T00:20:00Z`;

    const { data: task, error: taskError } = await client
      .from('tasks')
      .insert({
        user_id: userId,
        title: 'planning-execution-utc-straddle-test',
        category: 'testing',
        estimated_minutes: 30,
        planned_date: YESTERDAY,
        planned_start_at: plannedStartAt,
        status: 'pending',
      })
      .select('id')
      .single();
    expect(taskError).toBeNull();

    const { error: sessionError } = await client.from('task_sessions').insert({
      user_id: userId,
      task_id: task!.id,
      planned_start: plannedStartAt,
      actual_start: actualStartAt,
      planned_duration_min: 30,
      status: 'completed',
    });
    expect(sessionError).toBeNull();

    const { error: reviewError } = await client.from('daily_reviews').insert({
      user_id: userId,
      local_date: YESTERDAY,
      deep_work_planned_min: 60,
      deep_work_actual_min: 45,
      mits_planned: 2,
      mits_completed: 1,
    });
    expect(reviewError).toBeNull();

    const result = await computeYesterdayPlanningExecution(client, userId, TODAY);
    expect(result).not.toBeNull();
    // Real elapsed time is 30 minutes. The old bug reported -1410.
    expect(result!.startDelayMin).toBeGreaterThanOrEqual(29);
    expect(result!.startDelayMin).toBeLessThanOrEqual(31);
  });
});
