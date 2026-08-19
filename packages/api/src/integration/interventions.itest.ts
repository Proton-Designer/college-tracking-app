import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { addDays } from '@collegeos/core';
import { getUserLocalToday } from '../day/today';
import {
  evaluateDeviationPrompts,
  evaluateEscalations,
  evaluateStaleTaskPrompts,
  evaluateUpcomingBlockNotifications,
  respondToDeviationPrompt,
  respondToStaleTaskPrompt,
} from '../day/interventionEvaluation';
import { createKillHabit, setMaxEscalationLevel } from '../data/killHabits';
import { logKillEvent } from '../data/killEvents';
import { listFrictionLogs } from '../data/frictionLogs';
import { createConfirmedUser, SUPABASE_ANON_KEY, SUPABASE_URL } from './testSupport';
import type { Database } from '../database.types';
import type { TypedSupabaseClient } from '../client/types';

const TIMEZONE = 'America/Indiana/Indianapolis';

// L9: the intervention decision-and-record layer. Dedicated throwaway user, not demo --
// "reads against demo, writes against a throwaway" applies here too.
describe('L9: interventions', () => {
  let client: TypedSupabaseClient;
  let userId: string;
  let today: string;

  beforeAll(async () => {
    const email = `itest-interventions-${Date.now()}@collegeos.test`;
    const password = 'itest-interventions-password-1';
    const user = await createConfirmedUser(email, password);
    userId = user.id;

    client = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY!);
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (signInError) throw signInError;
    today = getUserLocalToday(TIMEZONE);
  });

  describe('exception-based notifications', () => {
    it('fires once for a block starting in 8 minutes, and does not duplicate on re-run', async () => {
      const now = new Date();
      const plannedStartAt = new Date(now.getTime() + 8 * 60_000);
      const { data: task, error } = await client
        .from('tasks')
        .insert({
          user_id: userId,
          title: 'BME block',
          category: 'testing',
          estimated_minutes: 75,
          planned_date: today,
          planned_start_at: plannedStartAt.toISOString(),
          status: 'pending',
        })
        .select('id')
        .single();
      expect(error).toBeNull();

      const first = await evaluateUpcomingBlockNotifications(client, userId, today, now);
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      const created = first.data.find((i) => i.related_task_id === task!.id);
      expect(created).toBeDefined();
      expect(created!.kind).toBe('exception_notification');
      expect(created!.message).toContain('BME block begins in 8 min');
      expect(created!.actions).toEqual(['Start', 'Move block']);
      expect(created!.status).toBe('pending');

      const second = await evaluateUpcomingBlockNotifications(client, userId, today, now);
      expect(second.ok).toBe(true);
      if (second.ok) expect(second.data.find((i) => i.related_task_id === task!.id)).toBeUndefined(); // no duplicate
    });
  });

  describe('deviation detection -> one-tap behavioral capture', () => {
    it('fires for a block 20 minutes late with no session started, and a real button tap logs a real friction entry', async () => {
      const now = new Date();
      const plannedStartAt = new Date(now.getTime() - 20 * 60_000);
      const { data: task, error } = await client
        .from('tasks')
        .insert({
          user_id: userId,
          title: 'Late block',
          category: 'testing',
          estimated_minutes: 60,
          planned_date: today,
          planned_start_at: plannedStartAt.toISOString(),
          status: 'pending',
        })
        .select('id')
        .single();
      expect(error).toBeNull();

      const result = await evaluateDeviationPrompts(client, userId, today, now);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const prompt = result.data.find((i) => i.related_task_id === task!.id);
      expect(prompt).toBeDefined();
      expect(prompt!.kind).toBe('deviation_prompt');
      expect(prompt!.actions).toEqual(['Forgot', 'Avoiding', 'Schedule changed', 'Start now']);

      const responded = await respondToDeviationPrompt(client, userId, prompt!.id, 'Avoiding');
      expect(responded.ok).toBe(true);
      if (!responded.ok) return;
      expect(responded.data.status).toBe('acted_on');
      expect(responded.data.action_taken).toBe('Avoiding');
      expect(responded.data.responded_at).not.toBeNull();

      const logs = await listFrictionLogs(client, userId);
      expect(logs.ok).toBe(true);
      if (logs.ok) {
        const matching = logs.data.find((l) => l.related_task_id === task!.id && l.cause === 'avoided_task');
        expect(matching).toBeDefined();
      }

      // Re-running must not fire again once a session exists OR the prompt is already answered --
      // proven here via the already-answered path (no session was ever started).
      const second = await evaluateDeviationPrompts(client, userId, today, now);
      expect(second.ok).toBe(true);
      if (second.ok) expect(second.data.find((i) => i.related_task_id === task!.id)).toBeUndefined();
    });

    it('"Start now" is compliance, not a failure -- no friction log gets written', async () => {
      const now = new Date();
      const plannedStartAt = new Date(now.getTime() - 20 * 60_000);
      const { data: task } = await client
        .from('tasks')
        .insert({
          user_id: userId,
          title: 'Start-now block',
          category: 'testing',
          estimated_minutes: 60,
          planned_date: today,
          planned_start_at: plannedStartAt.toISOString(),
          status: 'pending',
        })
        .select('id')
        .single();

      const result = await evaluateDeviationPrompts(client, userId, today, now);
      const prompt = result.ok ? result.data.find((i) => i.related_task_id === task!.id) : undefined;
      expect(prompt).toBeDefined();

      const before = await listFrictionLogs(client, userId);
      const beforeCount = before.ok ? before.data.length : -1;

      const responded = await respondToDeviationPrompt(client, userId, prompt!.id, 'Start now');
      expect(responded.ok).toBe(true);
      if (responded.ok) expect(responded.data.action_taken).toBe('Start now');

      const after = await listFrictionLogs(client, userId);
      expect(after.ok).toBe(true);
      if (after.ok) expect(after.data.length).toBe(beforeCount); // unchanged -- no new friction log
    });
  });

  describe('commitment escalation ladder', () => {
    it('escalates l0 -> l1 on repeated relapses, but refuses to escalate past the habit\'s own opt-in ceiling until raised', async () => {
      const habitResult = await createKillHabit(client, userId, { name: 'Instagram relapse (test)' });
      expect(habitResult.ok).toBe(true);
      if (!habitResult.ok) return;
      const habitId = habitResult.data.id;
      expect(habitResult.data.escalation_level).toBe('l0_reminder');
      expect(habitResult.data.max_escalation_level).toBe('l1_stronger_notification'); // migration 0016's default

      for (let i = 0; i < 3; i++) {
        const logged = await logKillEvent(client, userId, { killHabitId: habitId, outcome: 'relapsed' });
        expect(logged.ok).toBe(true);
      }

      const now = new Date();
      const first = await evaluateEscalations(client, userId, today, now);
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      const escalation = first.data.find((i) => i.related_kill_habit_id === habitId);
      expect(escalation).toBeDefined();
      expect(escalation!.kind).toBe('escalation_action');

      const { data: afterFirst } = await client.from('kill_habits').select('escalation_level').eq('id', habitId).single();
      expect(afterFirst!.escalation_level).toBe('l1_stronger_notification');

      const { data: auditRow } = await client
        .from('commitment_escalation_events')
        .select('from_level, to_level')
        .eq('kill_habit_id', habitId)
        .order('occurred_at', { ascending: false })
        .limit(1)
        .single();
      expect(auditRow!.from_level).toBe('l0_reminder');
      expect(auditRow!.to_level).toBe('l1_stronger_notification');

      // Three more relapses since the level was set -- evidence now supports l1 -> l2,
      // but the habit has never opted into l2. Must NOT escalate.
      for (let i = 0; i < 3; i++) {
        await logKillEvent(client, userId, { killHabitId: habitId, outcome: 'relapsed' });
      }
      const secondAttempt = await evaluateEscalations(client, userId, today, new Date());
      expect(secondAttempt.ok).toBe(true);
      if (secondAttempt.ok) expect(secondAttempt.data.find((i) => i.related_kill_habit_id === habitId)).toBeUndefined();
      const { data: stillL1 } = await client.from('kill_habits').select('escalation_level').eq('id', habitId).single();
      expect(stillL1!.escalation_level).toBe('l1_stronger_notification'); // unchanged -- clamped

      // Now the user explicitly opts in for THIS habit to allow l2.
      const optIn = await setMaxEscalationLevel(client, userId, habitId, 'l2_distraction_block');
      expect(optIn.ok).toBe(true);
      if (optIn.ok) expect(optIn.data.max_escalation_level).toBe('l2_distraction_block');

      const thirdAttempt = await evaluateEscalations(client, userId, today, new Date());
      expect(thirdAttempt.ok).toBe(true);
      if (thirdAttempt.ok) expect(thirdAttempt.data.find((i) => i.related_kill_habit_id === habitId)).toBeDefined();
      const { data: nowL2 } = await client.from('kill_habits').select('escalation_level').eq('id', habitId).single();
      expect(nowL2!.escalation_level).toBe('l2_distraction_block');
    });

    it('never escalates on a single relapse -- "do not begin with punishment"', async () => {
      const habitResult = await createKillHabit(client, userId, { name: 'YouTube in bed (test)' });
      expect(habitResult.ok).toBe(true);
      if (!habitResult.ok) return;
      const habitId = habitResult.data.id;

      await logKillEvent(client, userId, { killHabitId: habitId, outcome: 'relapsed' });

      const result = await evaluateEscalations(client, userId, today, new Date());
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.find((i) => i.related_kill_habit_id === habitId)).toBeUndefined();
      const { data: stillL0 } = await client.from('kill_habits').select('escalation_level').eq('id', habitId).single();
      expect(stillL0!.escalation_level).toBe('l0_reminder');
    });
  });

  describe('stale-task surface (FOLLOWUPS.md S5)', () => {
    it('does not fire for a task planned recently', async () => {
      const { data: task, error } = await client
        .from('tasks')
        .insert({ user_id: userId, title: 'Recent task', category: 'testing', planned_date: addDays(today, -5), status: 'pending' })
        .select('id')
        .single();
      expect(error).toBeNull();

      const result = await evaluateStaleTaskPrompts(client, userId, today);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.data.find((i) => i.related_task_id === task!.id)).toBeUndefined();
    });

    it('fires at 21 days, with an accurate day count in the message, and never duplicates on re-run', async () => {
      const staleDate = addDays(today, -21);
      const { data: task, error } = await client
        .from('tasks')
        .insert({ user_id: userId, title: 'Abandoned problem set', category: 'testing', planned_date: staleDate, status: 'pending' })
        .select('id')
        .single();
      expect(error).toBeNull();

      const first = await evaluateStaleTaskPrompts(client, userId, today);
      expect(first.ok).toBe(true);
      if (!first.ok) return;
      const prompt = first.data.find((i) => i.related_task_id === task!.id);
      expect(prompt).toBeDefined();
      expect(prompt!.kind).toBe('stale_task_prompt');
      expect(prompt!.message).toContain('21 days');
      expect(prompt!.actions).toEqual(['Still real', 'Let it go']);

      const second = await evaluateStaleTaskPrompts(client, userId, today);
      expect(second.ok).toBe(true);
      if (second.ok) expect(second.data.find((i) => i.related_task_id === task!.id)).toBeUndefined(); // no duplicate
    });

    it('"Let it go" cancels the task -- a neutral, real state change, not just an acknowledgement', async () => {
      const { data: task, error } = await client
        .from('tasks')
        .insert({ user_id: userId, title: 'No longer relevant', category: 'testing', planned_date: addDays(today, -30), status: 'pending' })
        .select('id')
        .single();
      expect(error).toBeNull();

      const fired = await evaluateStaleTaskPrompts(client, userId, today);
      expect(fired.ok).toBe(true);
      if (!fired.ok) return;
      const prompt = fired.data.find((i) => i.related_task_id === task!.id)!;

      const responded = await respondToStaleTaskPrompt(client, prompt.id, 'Let it go', today);
      expect(responded.ok).toBe(true);
      if (responded.ok) {
        expect(responded.data.status).toBe('acted_on');
        expect(responded.data.action_taken).toBe('Let it go');
      }

      const { data: cancelledTask } = await client.from('tasks').select('status').eq('id', task!.id).single();
      expect(cancelledTask!.status).toBe('cancelled');
    });

    it('"Still real" re-plans the task to today, which starts a NEW staleness episode -- it fires again once that re-planned date goes stale, not never again', async () => {
      const { data: task, error } = await client
        .from('tasks')
        .insert({ user_id: userId, title: 'Still working on it', category: 'testing', planned_date: addDays(today, -25), status: 'pending' })
        .select('id')
        .single();
      expect(error).toBeNull();

      const fired = await evaluateStaleTaskPrompts(client, userId, today);
      expect(fired.ok).toBe(true);
      if (!fired.ok) return;
      const prompt = fired.data.find((i) => i.related_task_id === task!.id)!;

      const responded = await respondToStaleTaskPrompt(client, prompt.id, 'Still real', today);
      expect(responded.ok).toBe(true);

      const { data: replannedTask } = await client.from('tasks').select('planned_date, status').eq('id', task!.id).single();
      expect(replannedTask!.planned_date).toBe(today);
      expect(replannedTask!.status).toBe('pending'); // still an active task, not cancelled

      // Re-running immediately does not re-fire -- the task was just re-planned to today,
      // nowhere near stale yet.
      const soonAfter = await evaluateStaleTaskPrompts(client, userId, today);
      expect(soonAfter.ok).toBe(true);
      if (soonAfter.ok) expect(soonAfter.data.find((i) => i.related_task_id === task!.id)).toBeUndefined();

      // The dedup check compares against interventions.local_date, which the DB derives
      // from occurred_at at real insert time -- not from the simulated `today` this test
      // otherwise controls. Backdating occurred_at here simulates "this prompt fired
      // before the task's current (replanned) planned_date," which is what a REAL prompt
      // fired 25 days ago and then replanned forward would actually look like; it's not
      // changing what's under test, only working around the one real-clock dependency an
      // itest can't otherwise fast-forward.
      const { error: backdateError } = await client.from('interventions').update({ occurred_at: `${addDays(today, -25)}T12:00:00Z` }).eq('id', prompt.id);
      expect(backdateError).toBeNull();

      // Simulate 21 more days passing from the NEW planned_date -- a fresh episode, so it
      // must be eligible to fire again, proving this is NOT a once-ever-per-task dedup.
      const twentyOneDaysLater = addDays(today, 21);
      const again = await evaluateStaleTaskPrompts(client, userId, twentyOneDaysLater);
      expect(again.ok).toBe(true);
      if (again.ok) expect(again.data.find((i) => i.related_task_id === task!.id)).toBeDefined();
    });
  });
});
