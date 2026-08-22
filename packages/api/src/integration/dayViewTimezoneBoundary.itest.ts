import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { getUserLocalToday } from '../day/today';
import { getDayView } from '../day/dayView';
import { createConfirmedUser, SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

// B4: dayView.ts computes today's session/event window as
// `new Date(`${today}T00:00:00Z`)` -- `today` is the user's correctly-computed LOCAL
// date (getUserLocalToday), but appending "Z" then treats that local date as a UTC
// instant. For any timezone offset from UTC, the true local-day window and the naive
// window disagree for exactly |offset| hours at each end. This test picks a `now`
// instant DETERMINISTICALLY inside that disagreement gap (never relying on real
// wall-clock timing, which is how this class of bug survives) for both a UTC-negative
// and a UTC-positive zone, and proves a task session created at that instant --
// genuinely "today" for that user -- vanishes from todayTaskSessions under the current
// naive window.
//
// Throwaway users, not demo -- writes real tasks/task_sessions rows and mutates
// profile.timezone.
describe('getDayView: today\'s window must be the user\'s real local day, not a UTC-midnight guess', () => {
  async function makeUserInTimezone(emailPrefix: string, timezone: string): Promise<{ client: TypedSupabaseClient; userId: string }> {
    const email = `itest-${emailPrefix}-${Date.now()}@collegeos.test`;
    const password = `itest-${emailPrefix}-password-1`;
    const user = await createConfirmedUser(email, password);

    const client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;

    const { error: profileError } = await client.from('profiles').update({ timezone }).eq('id', user.id);
    if (profileError) throw profileError;

    return { client, userId: user.id };
  }

  async function seedTodaySession(client: TypedSupabaseClient, userId: string, localToday: string, plannedStart: Date) {
    const { data: task, error: taskError } = await client
      .from('tasks')
      .insert({
        user_id: userId,
        title: 'timezone-boundary-test-task',
        category: 'testing',
        estimated_minutes: 30,
        planned_date: localToday,
        status: 'pending',
      })
      .select('id')
      .single();
    if (taskError) throw taskError;

    const { error: sessionError } = await client.from('task_sessions').insert({
      user_id: userId,
      task_id: task.id,
      planned_start: plannedStart.toISOString(),
      planned_duration_min: 25,
      status: 'active',
    });
    if (sessionError) throw sessionError;
  }

  it('UTC-negative zone (America/Indiana/Indianapolis, UTC-4 in August): a session in the naive-window\'s end-of-day gap must still count as today', async () => {
    const timezone = 'America/Indiana/Indianapolis';
    const { client, userId } = await makeUserInTimezone('tzneg', timezone);

    // 2026-08-22T02:00:00Z is 2026-08-21T22:00:00 local (EDT, UTC-4) -- still today,
    // local. The naive window for local-today (2026-08-21) is
    // [2026-08-21T00:00:00Z, 2026-08-22T00:00:00Z) -- this instant is PAST that naive
    // end, even though it's hours before real local midnight (2026-08-22T04:00:00Z).
    const now = new Date('2026-08-22T02:00:00Z');
    const localToday = getUserLocalToday(timezone, now);
    expect(localToday).toBe('2026-08-21');

    await seedTodaySession(client, userId, localToday, now);

    const dayView = await getDayView(client, userId, now);
    expect(dayView.ok).toBe(true);
    if (!dayView.ok) return;
    expect(dayView.data.today).toBe(localToday);
    expect(
      dayView.data.todayTaskSessions.some((s) => new Date(s.planned_start).getTime() === now.getTime()),
      'a session planned at an instant that is genuinely still today in the user\'s own timezone must appear in todayTaskSessions',
    ).toBe(true);
  });

  it('UTC-positive zone (Asia/Kolkata, UTC+5:30): a session in the naive-window\'s start-of-day gap must still count as today', async () => {
    const timezone = 'Asia/Kolkata';
    const { client, userId } = await makeUserInTimezone('tzpos', timezone);

    // 2026-08-20T20:00:00Z is 2026-08-21T01:30:00 local (IST, UTC+5:30) -- already
    // today, local. The naive window for local-today (2026-08-21) is
    // [2026-08-21T00:00:00Z, 2026-08-22T00:00:00Z) -- this instant is BEFORE that naive
    // start, even though real local midnight was already 5.5 hours earlier
    // (2026-08-20T18:30:00Z).
    const now = new Date('2026-08-20T20:00:00Z');
    const localToday = getUserLocalToday(timezone, now);
    expect(localToday).toBe('2026-08-21');

    await seedTodaySession(client, userId, localToday, now);

    const dayView = await getDayView(client, userId, now);
    expect(dayView.ok).toBe(true);
    if (!dayView.ok) return;
    expect(dayView.data.today).toBe(localToday);
    expect(
      dayView.data.todayTaskSessions.some((s) => new Date(s.planned_start).getTime() === now.getTime()),
      'a session planned at an instant that is genuinely still today in the user\'s own timezone must appear in todayTaskSessions',
    ).toBe(true);
  });
});
