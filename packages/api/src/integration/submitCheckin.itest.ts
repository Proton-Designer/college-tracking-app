import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { getUserLocalToday } from '../day/today';
import { submitMorningCheckin } from '../day/submitCheckin';
import { createConfirmedUser, SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

const TIMEZONE = 'America/Indiana/Indianapolis';

// U2: optional per-MIT timeboxing in the morning check-in -- the write path that makes
// tasks.planned_start_at/planned_location actually get set, which is what makes start
// delay measurable at all. Dedicated throwaway user, not demo.
describe('submitMorningCheckin: optional MIT timeboxing', () => {
  let client: TypedSupabaseClient;
  let userId: string;
  let today: string;

  beforeAll(async () => {
    const email = `itest-checkin-timebox-${Date.now()}@collegeos.test`;
    const password = 'itest-checkin-timebox-password-1';
    const user = await createConfirmedUser(email, password);
    userId = user.id;

    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    today = getUserLocalToday(TIMEZONE);
  });

  async function createTask(title: string) {
    const { data, error } = await client.from('tasks').insert({ user_id: userId, title, category: 'testing', planned_date: today, status: 'pending' }).select('id').single();
    expect(error).toBeNull();
    return data!.id;
  }

  it('a MIT with no timebox entry keeps planned_start_at/planned_location null -- the default, low-friction path', async () => {
    const taskId = await createTask('Untimeboxed MIT');
    const result = await submitMorningCheckin(client, { userId, localDate: today, energy: 7, mood: 6, predictedCompletionPct: 80, topMitTaskIds: [taskId] });
    expect(result.ok).toBe(true);

    const { data: task } = await client.from('tasks').select('planned_start_at, planned_location, mit_rank').eq('id', taskId).single();
    expect(task!.planned_start_at).toBeNull();
    expect(task!.planned_location).toBeNull();
    expect(task!.mit_rank).toBe(1);
  });

  it('a MIT with a real timebox writes both planned_start_at and planned_location', async () => {
    const taskId = await createTask('Timeboxed MIT');
    const plannedStartAt = `${today}T16:30:00.000Z`;
    const result = await submitMorningCheckin(client, {
      userId,
      localDate: today,
      energy: 7,
      mood: 6,
      predictedCompletionPct: 80,
      topMitTaskIds: [taskId],
      mitTimeboxes: { [taskId]: { plannedStartAt, plannedLocation: 'WALC library' } },
    });
    expect(result.ok).toBe(true);

    const { data: task } = await client.from('tasks').select('planned_start_at, planned_location').eq('id', taskId).single();
    expect(new Date(task!.planned_start_at!).getTime()).toBe(new Date(plannedStartAt).getTime());
    expect(task!.planned_location).toBe('WALC library');
  });

  it('a time with no location (and vice versa) are independently settable -- neither is required for the other', async () => {
    const timeOnlyTask = await createTask('Time only');
    const locationOnlyTask = await createTask('Location only');
    const plannedStartAt = `${today}T09:00:00.000Z`;

    const result = await submitMorningCheckin(client, {
      userId,
      localDate: today,
      energy: 7,
      mood: 6,
      predictedCompletionPct: 80,
      topMitTaskIds: [timeOnlyTask, locationOnlyTask],
      mitTimeboxes: {
        [timeOnlyTask]: { plannedStartAt },
        [locationOnlyTask]: { plannedLocation: 'Dorm room' },
      },
    });
    expect(result.ok).toBe(true);

    const { data: timeOnly } = await client.from('tasks').select('planned_start_at, planned_location').eq('id', timeOnlyTask).single();
    expect(new Date(timeOnly!.planned_start_at!).getTime()).toBe(new Date(plannedStartAt).getTime());
    expect(timeOnly!.planned_location).toBeNull();

    const { data: locationOnly } = await client.from('tasks').select('planned_start_at, planned_location').eq('id', locationOnlyTask).single();
    expect(locationOnly!.planned_start_at).toBeNull();
    expect(locationOnly!.planned_location).toBe('Dorm room');
  });

  it('omitting a task from mitTimeboxes on a resubmission leaves its existing timebox untouched, never silently clears it', async () => {
    const taskId = await createTask('Set once, resubmitted without a timebox entry');
    const plannedStartAt = `${today}T14:00:00.000Z`;

    const first = await submitMorningCheckin(client, {
      userId,
      localDate: today,
      energy: 5,
      mood: 5,
      predictedCompletionPct: 70,
      topMitTaskIds: [taskId],
      mitTimeboxes: { [taskId]: { plannedStartAt, plannedLocation: 'WALC library' } },
    });
    expect(first.ok).toBe(true);

    // Resubmit (e.g. the user re-opens check-in and re-taps "Start the day") WITHOUT a
    // mitTimeboxes entry for this task at all -- the timebox must survive.
    const second = await submitMorningCheckin(client, {
      userId,
      localDate: today,
      energy: 6,
      mood: 6,
      predictedCompletionPct: 75,
      topMitTaskIds: [taskId],
    });
    expect(second.ok).toBe(true);

    const { data: task } = await client.from('tasks').select('planned_start_at, planned_location').eq('id', taskId).single();
    expect(new Date(task!.planned_start_at!).getTime()).toBe(new Date(plannedStartAt).getTime());
    expect(task!.planned_location).toBe('WALC library');
  });

  it('explicitly setting plannedStartAt/plannedLocation to null clears an existing timebox', async () => {
    const taskId = await createTask('Set, then cleared');
    await submitMorningCheckin(client, {
      userId,
      localDate: today,
      energy: 5,
      mood: 5,
      predictedCompletionPct: 70,
      topMitTaskIds: [taskId],
      mitTimeboxes: { [taskId]: { plannedStartAt: `${today}T11:00:00.000Z`, plannedLocation: 'Library' } },
    });

    const cleared = await submitMorningCheckin(client, {
      userId,
      localDate: today,
      energy: 6,
      mood: 6,
      predictedCompletionPct: 75,
      topMitTaskIds: [taskId],
      mitTimeboxes: { [taskId]: { plannedStartAt: null, plannedLocation: null } },
    });
    expect(cleared.ok).toBe(true);

    const { data: task } = await client.from('tasks').select('planned_start_at, planned_location').eq('id', taskId).single();
    expect(task!.planned_start_at).toBeNull();
    expect(task!.planned_location).toBeNull();
  });
});
