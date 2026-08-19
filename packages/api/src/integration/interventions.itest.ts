import { createClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { getUserLocalToday } from '../day/today';
import {
  evaluateDeviationPrompts,
  evaluateEscalations,
  evaluateUpcomingBlockNotifications,
  respondToDeviationPrompt,
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
});
