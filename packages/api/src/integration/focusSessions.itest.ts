import { createClient } from '@supabase/supabase-js';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { signIn } from '../auth/auth';
import {
  abandonFocusSession,
  completeFocusSession,
  getActiveFocusSession,
  startFocusSession,
} from '../day/focusSessions';
import { loadCalibrationObservations } from '../day/calibration';
import { getDayView } from '../day/dayView';
import { DEMO_EMAIL, DEMO_PASSWORD, SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

// Proves L6's focus-session lifecycle (start/complete/abandon/resume) against the real
// local stack, including the two invariants that matter most: actual_duration_min is
// always server-computed from wall-clock time, never trusted from a caller, and an
// abandoned session must never pollute calibration the way a completed one does.

describe('focus sessions against the seeded demo user', () => {
  let client: TypedSupabaseClient;
  let userId: string;
  let taskId: number;

  beforeAll(async () => {
    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const result = await signIn(client, { email: DEMO_EMAIL, password: DEMO_PASSWORD });
    if (!result.ok) throw new Error(`demo signIn failed: ${result.error.code}`);
    userId = result.data.session.user.id;

    // Delete this file's own prior throwaway tasks before creating a new one -- cascades
    // to their task_sessions. Without this, repeated runs against the same local db
    // (encouraged by the idempotency rule) silently accumulate test rows forever, the
    // exact drift FOLLOWUPS.md's S2 already flags for the E2E suite.
    await client.from('tasks').delete().eq('user_id', userId).like('title', 'focus-session-test-%');

    // A dedicated throwaway task per test run rather than reusing a seeded one -- these
    // tests mutate task_sessions state (start/stop an active session) and shouldn't
    // depend on, or interfere with, whatever the seed's own tasks currently look like.
    const { data: course } = await client.from('courses').select('id').limit(1).single();
    const { data: task, error } = await client
      .from('tasks')
      .insert({
        user_id: userId,
        course_id: course!.id,
        title: `focus-session-test-${Date.now()}`,
        category: 'testing',
        estimated_minutes: 30,
        planned_date: new Date().toISOString().slice(0, 10),
        status: 'pending',
      })
      .select('id')
      .single();
    if (error) throw error;
    taskId = task.id;
  });

  // An assertion failure partway through a test must not leave an active session
  // lingering and cascade-fail every test after it (the one-active-session-per-user
  // constraint makes this a real risk here) -- guarantee cleanup regardless of outcome.
  afterEach(async () => {
    const active = await getActiveFocusSession(client, userId);
    if (active.ok && active.data) {
      await abandonFocusSession(client, userId, { sessionId: active.data.id });
    }
  });

  it('starts a session and makes it the one resumable active session', async () => {
    const started = await startFocusSession(client, userId, { taskId, plannedDurationMin: 25 });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.data.status).toBe('active');
    expect(started.data.actual_start).not.toBeNull();
    // This throwaway task has no planned_start_at (never timeboxed) -- so there's no
    // real plan to be early/late against, and startDelayMin must be null, not 0.
    expect(started.data.startDelayMin).toBeNull();
    expect(started.data.planned_start).toBe(started.data.actual_start);

    const active = await getActiveFocusSession(client, userId);
    expect(active.ok).toBe(true);
    if (active.ok) expect(active.data?.id).toBe(started.data.id);

    // Clean up so later tests in this file get a clean slate.
    const cleanup = await abandonFocusSession(client, userId, { sessionId: started.data.id });
    expect(cleanup.ok).toBe(true);
  });

  it('reports a real, nonzero startDelayMin when the task was actually timeboxed (A2)', async () => {
    const plannedStartAt = new Date(Date.now() - 42 * 60_000); // "planned" 42 minutes ago
    const { data: timeboxedTask, error } = await client
      .from('tasks')
      .insert({
        user_id: userId,
        course_id: (await client.from('courses').select('id').limit(1).single()).data!.id,
        title: `focus-session-test-timeboxed-${Date.now()}`,
        category: 'testing',
        estimated_minutes: 30,
        planned_date: new Date().toISOString().slice(0, 10),
        planned_start_at: plannedStartAt.toISOString(),
        status: 'pending',
      })
      .select('id')
      .single();
    expect(error).toBeNull();

    const started = await startFocusSession(client, userId, { taskId: timeboxedTask!.id, plannedDurationMin: 25 });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    // Started ~42 minutes after the planned time -- real, derived, not client-asserted.
    expect(started.data.startDelayMin).toBeGreaterThanOrEqual(41);
    expect(started.data.startDelayMin).toBeLessThanOrEqual(43);
    // Postgres round-trips timestamptz as +00:00, not Z -- compare parsed instants, not
    // raw strings, so this doesn't become a formatting test by accident.
    expect(new Date(started.data.planned_start).getTime()).toBe(plannedStartAt.getTime());
    expect(started.data.planned_start).not.toBe(started.data.actual_start);

    const cleanup = await abandonFocusSession(client, userId, { sessionId: started.data.id });
    expect(cleanup.ok).toBe(true);
    await client.from('tasks').delete().eq('id', timeboxedTask!.id);
  });

  it('refuses to start a second session while one is already active', async () => {
    const first = await startFocusSession(client, userId, { taskId, plannedDurationMin: 25 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await startFocusSession(client, userId, { taskId, plannedDurationMin: 25 });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('conflict');

    const cleanup = await abandonFocusSession(client, userId, { sessionId: first.data.id });
    expect(cleanup.ok).toBe(true);
  });

  it('completing a session computes actual_duration_min from wall-clock time, never from caller input', async () => {
    const started = await startFocusSession(client, userId, { taskId, plannedDurationMin: 25 });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    // A real, small, but nonzero wall-clock gap -- proves the server derives duration
    // from actual timestamps, not from something the test could spoof.
    const startedAt = new Date(started.data.actual_start!);
    const completedAt = new Date(startedAt.getTime() + 90_000); // +90s

    const completed = await completeFocusSession(
      client,
      userId,
      { sessionId: started.data.id, interruptions: 1, subjectiveFocus: 4, objectiveOutput: 'Finished section 2.' },
      completedAt,
    );
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    expect(completed.data.status).toBe('completed');
    expect(completed.data.actual_duration_min).toBe(2); // ceil-rounded from 1.5 min
    expect(completed.data.interruptions).toBe(1);
    expect(completed.data.subjective_focus).toBe(4);
    expect(completed.data.objective_output).toBe('Finished section 2.');

    // The active slot is free again.
    const active = await getActiveFocusSession(client, userId);
    expect(active.ok && active.data).toBeNull();
  });

  it('an abandoned session is excluded from calibration observations; a completed one is included', async () => {
    const { data: profile } = await client.from('profiles').select('timezone').eq('id', userId).single();

    // Distinctive, run-unique estimatedMin values (not e.g. a fixed 40) so this test
    // stays idempotent across repeated runs against the same local db -- task_sessions
    // rows from a prior run are never deleted, so identifying "this run's" observations
    // by a fixed duration would accumulate false matches instead of catching real bugs.
    const runId = Date.now() % 100_000;
    const abandonedDurationMin = 10_000 + runId;
    const completedDurationMin = 20_000 + runId;

    const abandoned = await startFocusSession(client, userId, { taskId, plannedDurationMin: abandonedDurationMin });
    expect(abandoned.ok).toBe(true);
    if (!abandoned.ok) return;
    const abandonedResult = await abandonFocusSession(client, userId, { sessionId: abandoned.data.id });
    expect(abandonedResult.ok).toBe(true);

    const completed = await startFocusSession(client, userId, { taskId, plannedDurationMin: completedDurationMin });
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;
    const completedResult = await completeFocusSession(client, userId, { sessionId: completed.data.id });
    expect(completedResult.ok).toBe(true);

    const observations = await loadCalibrationObservations(client, userId, profile!.timezone, new Date());
    const testingObservations = observations.byCategory.get('testing') ?? [];

    const fromAbandonedSession = testingObservations.some((o) => o.estimatedMin === abandonedDurationMin);
    const fromCompletedSession = testingObservations.some((o) => o.estimatedMin === completedDurationMin);
    expect(fromAbandonedSession).toBe(false);
    expect(fromCompletedSession).toBe(true);
  });

  it('a completed session actually appears on the Day Trace end-to-end -- not just written, but read back through getDayView', async () => {
    const started = await startFocusSession(client, userId, { taskId, plannedDurationMin: 25 });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const completed = await completeFocusSession(client, userId, { sessionId: started.data.id, objectiveOutput: 'Day Trace check' });
    expect(completed.ok).toBe(true);
    if (!completed.ok) return;

    const dayView = await getDayView(client, userId);
    expect(dayView.ok).toBe(true);
    if (!dayView.ok) return;

    const onTrace = dayView.data.todayTaskSessions.find((s) => s.id === completed.data.id);
    expect(onTrace).toBeDefined();
    expect(onTrace!.status).toBe('completed');
    expect(onTrace!.objective_output).toBe('Day Trace check');
  });

  it('ending an already-ended session is refused, not a silent no-op', async () => {
    const started = await startFocusSession(client, userId, { taskId, plannedDurationMin: 25 });
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const first = await completeFocusSession(client, userId, { sessionId: started.data.id });
    expect(first.ok).toBe(true);

    const second = await completeFocusSession(client, userId, { sessionId: started.data.id });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.code).toBe('conflict');
  });
});
