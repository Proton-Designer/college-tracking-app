import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { deleteTask, updateTask } from '../data/tasks';
import { createConfirmedUser, SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

// L12A: updateTask/deleteTask -- createTask/updateTaskStatus already existed, edit and
// delete didn't. Throwaway user, not demo.
describe('task update/delete against a dedicated throwaway user', () => {
  let client: TypedSupabaseClient;
  let userId: string;

  beforeAll(async () => {
    const email = `itest-taskcrud-${Date.now()}@collegeos.test`;
    const password = 'itest-taskcrud-password-1';
    const user = await createConfirmedUser(email, password);
    userId = user.id;

    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
  });

  async function makeTask(overrides: Record<string, unknown> = {}) {
    const { data, error } = await client
      .from('tasks')
      .insert({
        user_id: userId,
        title: 'task-crud-test-task',
        category: 'testing',
        estimated_minutes: 30,
        planned_date: '2026-11-01',
        status: 'pending',
        ...overrides,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }

  it('updates task fields, including setting and clearing a timebox', async () => {
    const taskId = await makeTask();

    const updated = await updateTask(client, userId, taskId, {
      title: 'Renamed task',
      estimatedMinutes: 45,
      plannedDate: '2026-11-02',
      plannedStartAt: '2026-11-02T18:00:00Z',
      plannedLocation: 'WALC library',
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.data.title).toBe('Renamed task');
    expect(updated.data.estimated_minutes).toBe(45);
    expect(updated.data.planned_date).toBe('2026-11-02');
    expect(updated.data.planned_location).toBe('WALC library');

    // Omitting plannedStartAt/plannedLocation entirely must leave them alone.
    const untouched = await updateTask(client, userId, taskId, { title: 'Renamed again' });
    expect(untouched.ok).toBe(true);
    if (untouched.ok) expect(untouched.data.planned_location).toBe('WALC library');

    // Explicit null clears the timebox.
    const cleared = await updateTask(client, userId, taskId, { plannedStartAt: null, plannedLocation: null });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) {
      expect(cleared.data.planned_start_at).toBeNull();
      expect(cleared.data.planned_location).toBeNull();
    }
  });

  it('never touches status/completed_at -- that stays updateTaskStatus\'s job', async () => {
    const taskId = await makeTask({ status: 'completed', completed_at: new Date().toISOString() });
    const updated = await updateTask(client, userId, taskId, { title: 'Edited a completed task' });
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.data.status).toBe('completed');
  });

  it('deletes a task; a second delete of the same id is refused, not a silent no-op', async () => {
    const taskId = await makeTask();
    const deleted = await deleteTask(client, userId, taskId);
    expect(deleted.ok).toBe(true);

    const { data: row } = await client.from('tasks').select('id').eq('id', taskId).maybeSingle();
    expect(row).toBeNull();

    const secondDelete = await deleteTask(client, userId, taskId);
    expect(secondDelete.ok).toBe(false);
    if (!secondDelete.ok) expect(secondDelete.error.code).toBe('not_found');
  });

  it('a user cannot update or delete another user\'s task', async () => {
    const otherEmail = `itest-taskcrud-other-${Date.now()}@collegeos.test`;
    const otherUser = await createConfirmedUser(otherEmail, 'itest-taskcrud-other-password-1');
    const otherClient = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const { error: otherSignInError } = await otherClient.auth.signInWithPassword({ email: otherEmail, password: 'itest-taskcrud-other-password-1' });
    if (otherSignInError) throw otherSignInError;

    const { data: otherTask, error } = await otherClient
      .from('tasks')
      .insert({ user_id: otherUser.id, title: 'other user task', category: 'testing', estimated_minutes: 20, planned_date: '2026-11-01', status: 'pending' })
      .select('id')
      .single();
    expect(error).toBeNull();

    const updateAttempt = await updateTask(client, userId, otherTask!.id, { title: 'hijacked' });
    expect(updateAttempt.ok).toBe(false);

    const deleteAttempt = await deleteTask(client, userId, otherTask!.id);
    expect(deleteAttempt.ok).toBe(false);
    if (!deleteAttempt.ok) expect(deleteAttempt.error.code).toBe('not_found');

    const { data: stillThere } = await otherClient.from('tasks').select('title').eq('id', otherTask!.id).eq('user_id', otherUser.id).single();
    expect(stillThere!.title).toBe('other user task');
  });
});
