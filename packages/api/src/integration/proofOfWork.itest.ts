import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { updateTaskStatus, createTask } from '../data/tasks';
import { submitProofOfWork } from '../data/proofOfWork';
import { createConfirmedUser, SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

// Dedicated throwaway user, not demo -- "reads against demo, writes against a
// throwaway" (same line focusSessions.itest.ts already draws). These tests write real
// tasks and a real proof attachment upload; demo's value is its stable, curated data.
describe('proof of work against a dedicated throwaway user', () => {
  let client: TypedSupabaseClient;
  let userId: string;

  beforeAll(async () => {
    const email = `itest-pow-${Date.now()}@collegeos.test`;
    const password = 'itest-pow-password-1';
    const user = await createConfirmedUser(email, password);
    userId = user.id;

    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
  });

  async function makeTask(overrides: Partial<Database['public']['Tables']['tasks']['Insert']> = {}) {
    // No course dependency -- tasks.course_id is nullable, and a throwaway user has no
    // seeded courses to link to anyway.
    const result = await createTask(client, {
      user_id: userId,
      title: `pow-test-${Date.now()}-${Math.random()}`,
      category: 'testing',
      estimated_minutes: 30,
      planned_date: new Date().toISOString().slice(0, 10),
      status: 'pending',
      ...overrides,
    });
    expect(result.ok).toBe(true);
    return result.ok ? result.data : null;
  }

  it('an ordinary task (no proof required) completes normally -- no regression on the common case', async () => {
    const task = await makeTask();
    expect(task).not.toBeNull();
    const completed = await updateTaskStatus(client, task!.id, 'completed');
    expect(completed.ok).toBe(true);
    if (completed.ok) expect(completed.data.status).toBe('completed');
  });

  it('refuses to complete a proof-requiring task until proof is actually submitted', async () => {
    const task = await makeTask({ requires_proof_of_work: true, proof_of_work_type: 'summary_text' });
    expect(task).not.toBeNull();

    const blocked = await updateTaskStatus(client, task!.id, 'completed');
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe('validation');

    // Still not completed after the refusal -- a rejection is not a partial completion.
    const { data: stillPending } = await client.from('tasks').select('status').eq('id', task!.id).single();
    expect(stillPending!.status).toBe('pending');

    const submitted = await submitProofOfWork(client, userId, {
      taskId: task!.id,
      type: 'summary_text',
      content: 'Finished all 12 practice problems, reviewed the two I got wrong.',
    });
    expect(submitted.ok).toBe(true);
    if (submitted.ok) expect(submitted.data.proof_of_work_content).toContain('12 practice problems');

    const completed = await updateTaskStatus(client, task!.id, 'completed');
    expect(completed.ok).toBe(true);
    if (completed.ok) expect(completed.data.status).toBe('completed');
  });

  it('refuses proof submission when the type does not match what the task actually requires', async () => {
    const task = await makeTask({ requires_proof_of_work: true, proof_of_work_type: 'git_commit' });
    expect(task).not.toBeNull();

    const wrongType = await submitProofOfWork(client, userId, {
      taskId: task!.id,
      type: 'summary_text',
      content: 'wrong type of proof',
    });
    expect(wrongType.ok).toBe(false);
    if (!wrongType.ok) expect(wrongType.error.code).toBe('validation');
  });

  it('refuses proof submission for a task that never required any', async () => {
    const task = await makeTask();
    expect(task).not.toBeNull();

    const result = await submitProofOfWork(client, userId, {
      taskId: task!.id,
      type: 'summary_text',
      content: 'unrequested proof',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('validation');
  });

  it('uploads a real attachment to the private proof bucket and stores its real path', async () => {
    const task = await makeTask({ requires_proof_of_work: true, proof_of_work_type: 'confirmation_attachment' });
    expect(task).not.toBeNull();

    const fileBytes = new TextEncoder().encode('%PDF-1.4 fake proof-of-work attachment');
    const submitted = await submitProofOfWork(client, userId, {
      taskId: task!.id,
      type: 'confirmation_attachment',
      file: fileBytes,
      fileName: 'completion-screenshot.pdf',
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    expect(submitted.data.proof_of_work_content).toContain(`${userId}/`);
    expect(submitted.data.proof_of_work_content).toContain('completion-screenshot.pdf');

    const { data: downloaded, error: downloadError } = await client.storage
      .from('proof')
      .download(submitted.data.proof_of_work_content!);
    expect(downloadError).toBeNull();
    const text = await downloaded!.text();
    expect(text).toContain('fake proof-of-work attachment');

    const completed = await updateTaskStatus(client, task!.id, 'completed');
    expect(completed.ok).toBe(true);
  });
});
